const is_boolean = (term) => {
  return (typeof term === 'boolean');
};

const is_number = (term) => {
  return (typeof term === 'number');
};

const is_string = (term) => {
  return (typeof term === 'string');
};

const is_undefined = (term) => {
  return (typeof term === 'undefined');
};

const is_array = (term) => {
  return (Array.isArray(term));
};

const is_list = (term) => {
  return is_array(term);
};

const is_map = (term) => {
  // Not totally waterproof
  return term instanceof Map;
};

const is_atom = (term) => {
  return (typeof term === 'object' && (term.hasOwnProperty('a') || term.hasOwnProperty('atom')));
};

const is_binary = (term) => {
  return (typeof term === 'object' && (term.hasOwnProperty('b') || term.hasOwnProperty('binary')));
};

const is_tuple = (term) => {
  return (typeof term === 'object' && ((term.hasOwnProperty('t') && is_array(term.t)) || (term.hasOwnProperty('tuple') && is_array(term.tuple))));
};

const is_pid = (term) => {
  return (typeof term === 'object' && (term.hasOwnProperty('p') || term.hasOwnProperty('pid')));
};

const is_reference = (term) => {
  return (typeof term === 'object' && (term.hasOwnProperty('n') || term.hasOwnProperty('new_reference')));
};

const get_atom = (atom) => {
  if (!is_atom(atom)) throw new Error('Not an atom');
  return atom.a ? atom.a : atom.atom;
};

const set_atom = (atomText) => {
  if (!typeof atomText === 'string') throw new Error('atomText is not a string');
  return {a: atomText};
};

const get_binary = (binary) => {
  if (!is_binary(binary)) throw new Error('Not a binary');
  return binary.b ? binary.b : binary.binary;
};

const set_binary = (bufferOrText) => {
  if (!typeof bufferOrText === 'string' && !bufferOrText instanceof Buffer)
    throw new Error('binary can only be set with a string or a' + ' buffer');
  return {b: bufferOrText};
};

const get_tuple = (tuple) => {
  if (!is_tuple(tuple)) throw new Error('Not a tuple');
  return tuple.t ? tuple.t : tuple.tuple;
};

const tuple_length = (tuple) => {
  if (!is_tuple(tuple)) throw new Error('Not a tuple');
  return get_tuple(tuple).length;
};

const set_tuple = (array) => {
  if (!Array.isArray(array)) throw new Error('Tuple can only be set with an array');
  return {t: array};
};

const get_pid = (pid) => {
  if (!is_pid(pid)) throw new Error('Not a pid');
  return pid.p ? pid.p : pid.pid;
};

const set_pid = (node, ID, serial, creation) => {
  if (!typeof ID === 'number' || !typeof serial === 'number' || !typeof creation === 'number')
    throw new Error('ID, serial, and creation must be integers');
  return {p: {node: set_atom(node), ID, serial, creation}};
};

const get_reference = (reference) => {
  if (!is_reference(reference)) throw new Error('Not a reference');
  return reference.n ? reference.n : reference.new_reference;
};

const set_reference = (node, creation, ID) => {
  if (!Array.isArray(ID) || ID.length !== 3) throw new Error('ID must be an array of length 3');
  return {n: {node: set_atom(node), creation, ID}}
};

const print_term = (term) => {
   const print_array = (arr) => {
    let result = '[\n';
    for (let i = 0; i < arr.length; i++) {
      result += print_term(arr[i]);
    }
    return result + ']\n';
  }

  if (is_array(term)) {
    return `list: ${print_array(term)}`;
  }

  if (is_atom(term)) {
    return `atom: ${get_atom(term)}\n`;
  }

  if (is_binary(term)) {
    return `binary: ${get_binary(term)}\n`;
  }

  if (is_tuple(term)) {
    const arr = get_tuple(term);
    return `tuple: ${print_array(arr)}`;
  }

  if (is_pid(term)) {
    const pid = get_pid(term);
    return `pid: ${get_atom(pid.node)} ${pid.ID} ${pid.serial} ${pid.creation}\n`;
  }

  if (is_reference(term)) {
    const ref = get_reference(term);
    return `reference: ${get_atom(ref.node)} ${ref.ID} ${ref.creation}\n`;
  }

  if (term) {
    return `simple data: ${term.toString()}\n`;
  }

  return `Unknown: ${typeof term}\n`;
};

module.exports = {
  is_boolean,
  is_number,
  is_string,
  is_undefined,
  is_array,
  is_list,
  is_atom,
  is_binary,
  is_tuple,
  is_pid,
  is_reference,
  get_atom,
  set_atom,
  get_binary,
  set_binary,
  get_tuple,
  tuple_length,
  set_tuple,
  get_pid,
  set_pid,
  get_reference,
  set_reference,
  print_term
};
