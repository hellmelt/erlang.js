// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

var fs = require('fs')
var net = require('net')
var tap = require('tap')
var util = require('util')
var async = require('async')
var child_process = require('child_process')
var { is_pid } = require('../types')
var lib = require('../lib')

var API = require('../api.js')


var ECHO = {child:null, port:null, wait_timer:null}
var THAI = '<<224,184,160,224,184,178,224,184,169,224,184,178,224,185,132,224,184,151,224,184,162>>'
var MAP = '#{"name" => "Anders","surname" => "Hjelm"}'
var TERMS =
  [ '["two","array"]'      , ['two', 'array']                       // Innocent 2-array
    , '"ABCDE"'              , "ABCDE"                              // string (char list, encoded as STRING)
    , '[1,2,3,4]'            , [1, 2, 3, 4]                         // Array of small INT
    , '[]'                   , []                                   // Empty array
    , 'foo'                  , {a:'foo'}                            // atom
    , "'GET'"                , {a:'GET'}
    , '[{jason,awesome}]'    , [ {t:[{a:'jason'}, {a:'awesome'}]} ]
    , '[1,false,nil,2]'      , [1, false, null, 2]                  // list with falsy values inside
    , THAI                   , {b: Buffer.from('ภาษาไทย', 'utf8')}   // binary
    , '<<"Foo">>'            , {b: Buffer.from('Foo', 'utf8')}
    , '[[[[23,"skidoo"]]]]'  , [[[[23, 'skidoo']]]]                 // nested objects
    , '123456'               , 123456                               // normal integer
    , '3.14159'              , 3.14159                              // normal float
    , '{"tuple",here,too}'   , {t:['tuple', {a:'here'}, {a:'too'}]} //tuple
    , '{booleans,true,false}', {t:[ {a:'booleans'}, true, false ]}  // Booleans
    , MAP                    , new Map([['name', 'Anders'], ['surname', 'Hjelm']]) // Map
    /*
     Map keys which are objects, like {a: 'name} does not evaluate as equal in deepEqual. (Might be
     a bug in Map that propagates to tsame. map.has({a: 'name'}) is false, even though the map has
     that key.) And this will be common in maps from erlang, supposedly. But this test case cannot use
     objects as keys.
    */

    , '<8020.160.0>'         , {p: {node: {a: 'e@host'}, ID: 160, serial: 0, creation: 0}} // Pid
    /*
     The first part of a pid depends on how the node represents references to other nodes.
     That is unpredictable. That is why the test evaluation below has a special for for pids.
     */

    /*
     , '#Ref{7613.42}'               , {r: {node: {a: 'e@host'}, creation: 0, ID: 42}} // Reference.
     Erlang returns a new_reference, so this testcase fails.
    */

    , '#Ref<7613.44.43.42>'  , {n: {node: {a: 'e@host'}, creation: 0, ID: [42, 43, 44]}} // New_reference
  ].reduce(join_pairs, [])

function join_pairs(state, item, i, terms) {
  if(i % 2 == 0)
    state.push({'repr':item, 'term':terms[i+1]})
  return state
}

tap.test('Erlang round-trip echo server', function(t) {
  t.plan(3)

  var term = 87
  send(term, function(er, results) {
    // Find the newline boundary
    t.is(er, null, 'No problem sending and receiving a term')
    t.ok(results.repr, 'Got a code representation of the term')
    t.ok(results.encoded, 'Got a re-encoded term from Erlang')
    t.end()
  })
})

tap.test('Encoding', function(t) {
  t.plan(TERMS.length * 3)

  async.eachSeries(TERMS, test_pair, pairs_tested)

  function test_pair(pair, to_async) {
    send(pair.term, function(er, results) {
      if (er)
        return to_async(er)

      if (is_pid(pair.term)) {
        var res = results.repr.split('.')
        var pr = pair.repr.split('.')
        t.equal(
          res[0].split('')[0] + res[1] + res[2],
          pr[0].split('')[0] + pr[1] + pr[2],
          'Good representation: ' + pair.repr
      )} else {
        t.equal(results.repr, pair.repr, 'Good representation: ' + pair.repr)
      }

      var encoded_term = API.term_to_binary(pair.term)
      var decoded_term = API.binary_to_term(results.encoded)

      if (results.encoded[1] === lib.tags.STRING && encoded_term[1] === lib.tags.LIST) {
        // This is the case where erlang encodes a list of small ints as a string!
        // It is impossible to distinguish if a string or list is correct. But
        // in our test case, it should be a list.
        encoded_term = API.term_to_binary(API.array_to_string(pair.term));
        decoded_term = API.string_to_array(decoded_term);
      }

      t.same(results.encoded, encoded_term, 'Binary encoding matches Erlang: ' + pair.repr)

      t.deepEqual(decoded_term, pair.term, 'Decode matches original: ' + pair.repr)

      return to_async(null)
    })
  }

  function pairs_tested(er) {
    if(er)
      throw er

    t.end()
    process.kill(ECHO.child.pid)
    ECHO.wait_timer = setTimeout(function() { process.exit(1) }, 3000)
  }
})


function send(term, callback) {
  with_server(function() {
    var response = []

    var client = net.connect({'port':ECHO.port}, on_connect)
    client.on('data', on_data)
    client.on('end', on_end)

    function on_connect() {
      // Send the term.
      var bin = API.term_to_binary(term)
      var length = Buffer.alloc(4)
      length.writeUInt32BE(bin.length, 0)

      client.write(length)
      client.write(bin)
    }

    function on_data(chunk) {
      response.push(chunk)
    }

    function on_end() {
      client.end()

      response = Buffer.concat(response)

      var repr, encoded
      for (var i = 0; i < response.length; i++)
        if(response[i] == 13 && response[i+1] == 10) {
          repr = response.slice(0, i).toString('utf8') //.replace(/\r?\n\s*/g, '')
          encoded = response.slice(i+2)
          break
        }

      if (!repr)
        return callback(new Error('Bad repr'))
      if (!encoded)
        return callback(new Error('Bad encoded version'))

      callback(null, {'repr':repr, 'encoded':encoded})
    }
  }) // with_server
}

function with_server(callback) {
  if (ECHO.child)
    return process.nextTick(callback)

  process.env.port = 1024 + Math.floor(Math.random() * 10000)
  ECHO.port = process.env.port
  ECHO.child = child_process.spawn('escript', [__dirname+'/echo.escript'], {'stdio':'ignore'})

  ECHO.child.on('error', function(er) {
    if(er.errno == 'ENOENT')
      console.error('Could not run escript. Is `escript` in your $PATH?')

    callback(er)
  })

  ECHO.child.on('close', function(code) {
    clearTimeout(ECHO.wait_timer)
  })

  setTimeout(callback, 1000)
}
