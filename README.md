# erlang.js

## Basic Erlang and Node.js interoperability

Erlang.js is a simple JavaScript library to support the standard 
[Erlang External Term Format](http://erlang.org/doc/apps/erts/erl_ext_dist.html) 
(`term_to_binary` and `binary_to_term`).

If you send data to an Erlang program, and that program will run `binary_to_term()`, then you need Erlang.js.
Or if you set up erlang cnodes in node, using the [erlnode](https://github.com/hellmelt/erlnode) package,
you have to work with the erlang foreign data types as defined in this package.

Erlang.js was spun off from production code used at Iris Couch. Erlang.js is available as an npm module.

    npm install erlang

## Examples

Pass a data structure to `term_to_binary()` and it will return a Node.js buffer of that data, encoded.

Pass a Node.js buffer encoded with Erlang External Term Format to `binary_to_term()` and it will return
a data structure.

## Data Types

Some data types encode and decode as you would expect: numbers, arrays, and booleans.

But Erlang has foreign data types. Erlang.js supports a simple mechanism to represent those in JavaScript.
Each term of a foreign type is an object with one property, where the name of the property represents
the data type. Example:
```javascript
const atom = {a: 'theAtom'}
```
The exceptions are strings and maps. Strings are not encoded as objects, and erlang maps corresponds
to JavaScript Maps.

| Data type | Property name | Shorthand |
|-----------|---|---|
| atom      | atom | a |
| binary    | binary | b |
| tuple     | tuple | t |
| reference | reference | r |
| new reference | new_reference | n |
| pid           | pid | p |

### Atoms

`{atom:"Foo"}` encodes as Erlang `'Foo'`. You can also use a shorthand, `{a:"Foo"}`.

```javascript
term_to_binary({a:'POST'}) // Encodes the atom 'POST'
```

### Binaries

`{binary:'Foo'}` encodes as Erlang `<<"Foo">>`. You can also use a shorthand, `{b:"Foo"}`.

```javascript
term_to_binary({b:'POST'}) // Encodes the binary <<"POST">>
```

### Tuples

`{tuple:['foo', 'bar']}` encodes as Erlang `{"foo", "bar"}`. You can also use a shorthand, `{t:['foo', 'bar']}`.

```javascript
var foo = {a:'foo'} // an atom
term_to_binary({t:[foo, 'bar']}) // Encodes the tuple {foo, "bar"}
```

### References
The old form of reference seems to be used only in ancient versions of erlang. Use new_reference instead!
The representation of new reference is an object with properties
 * node - an atom
 * creation - integer
 * ID - an array of 1, 2, or 3 integers

```javascript
var ref = {n: {node: {a: 'e@host'}, creation: 0, ID: [42, 43, 44]}}
term_to_binary(ref) // Will be represented as #Ref<7613.44.43.42> in erlang
```

### Pid
An erlang pid is represented as an object with properties
 * node - an atom
 * ID - an integer
 * serial - an integer
 * creation - an integer

```javascript
{p: {node: {a: 'e@host'}, ID: 160, serial: 0, creation: 0}} // Will be represented as <8020.160.0> in erlang
```

### Strings

JavaScript strings are converted to Erlang strings (i.e. lists of integers), and vice versa.

```javascript
term_to_binary('I am a string') // Encodes the Erlang string "I am a string"
```

### Erlang lists
Erlang lists are represented as JavaScript Arrays, and vice versa.

### Maps
Erlang maps are represented as JavaScript Maps, and vice versa.

## Optlists

In JavaScript, if an API has tons of options, it tends to use an object.

```javascript
// An API with so many options it uses a single object argument:
request({url:"http://jsonip.com", json:true}, my_callback)
```

Erlang does not have this (for one thing, all data is always immutable). Instead it uses option lists (optlists) of mostly atoms and tagged tuples.

```erlang
Options = [set, public, {keypos, 1}, {write_concurrency, true}, compressed],
ets:new(my_table, Options).
```

Optlists are common in Erlang. You can build them manually with `term_to_binary()`, but the data structure is messy and distracting. Erlang.js provides an alternative, `optlist_to_binary()` which encodes more readable and obvious JavaScript data structures.

`optlist_to_binary()` encodes its arguments as an array. Each argument must be:

1. A short string (all-lowercase, up to 255 characters): converted to an atom
2. A 2-array where the first element is a short string: converted to a tagged tuple
3. An object with only one key/val pair: converted to a tagged tuple

To encode the optlist from the above Erlang example:

```javascript
optlist_to_binary('set', 'public', ['keypos', 1], {write_concurrency:true}, 'compressed')

/* Same as
term_to_binary([ { atom: 'set' }
               , { atom: 'public' }
               , { tuple: [ { atom: 'keypos' }, 1 ] }
               , { tuple: [ { atom: 'write_concurrency' }, true ] }
               , { atom: 'compressed' }
               ])
*/
```

## License

Apache 2.0

See the [Apache 2.0 license](named/blob/master/LICENSE).

[tap]: https://github.com/isaacs/node-tap
[def]: https://github.com/iriscouch/defaultable
