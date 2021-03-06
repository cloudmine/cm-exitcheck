'use strict';
var chai = require('chai');
chai.should();
var expect = chai.expect;
var sinon = require('sinon');
var fs = require('fs');
var fix_dir = './test/fixtures/';
var ex_dir = './test/examples/';
var esprima = require('esprima');

function parse(code_to_parse){
  // so I don't have to specific the esprima params every time
  return esprima.parse(code_to_parse, {
    'range': true,
    'loc': true,
  });
}

// I'm redoing the same variables a lot, and they're read from files
// Seems reasonable to declare them globally
var conditional_code = fs.readFileSync(ex_dir + 'conditional_code.js', 'utf8');
var callback_code = fs.readFileSync(ex_dir + 'callback_code.js', 'utf8');
var promise_code = fs.readFileSync(ex_dir + 'promise_code.js', 'utf8');

var conditional_string = fs.readFileSync(ex_dir + 'conditional_string.txt', 'utf8');
var callback_string = fs.readFileSync(ex_dir + 'callback_string.txt', 'utf8');
var promise_string = fs.readFileSync(ex_dir + 'promise_string.txt', 'utf8');

var conditional_json = JSON.parse(fs.readFileSync(ex_dir + 'conditional_json.json', 'utf8'));
var callback_json = JSON.parse(fs.readFileSync(ex_dir + 'callback_json.json', 'utf8'));
var promise_json = JSON.parse(fs.readFileSync(ex_dir + 'promise_json.json', 'utf8'));

var utils = require('../lib/utils.js');
describe('utils.is_exit', function(){
  var exit_code = "exit();";
  var exit_node = parse(exit_code).body[0];
  var not_exit_code = "not_exit()";
  var not_exit_node = parse(not_exit_code).body[0];
  var not_fcn_code = "var a;";
  var not_fcn_node = parse(not_fcn_code).body[0];

  it('should return true for an exit call', function(){
    expect(utils.is_exit(exit_node)).to.be.true;
  });

  it('should return true for a function that includes an exit call', function(){
    expect(utils.is_exit(not_exit_node, ['not_exit'])).to.be.true;
  });

  it('should return false for other function calls', function(){
    expect(utils.is_exit(not_exit_node)).to.be.false;
  });

  it('should return false for non function calls', function(){
    expect(utils.is_exit(not_fcn_node)).to.be.false;
  });
});

describe('utils.has_exit', function(){
  var exit = "function a(){exit();}";
  var exit_node = parse(exit).body[0];
  var wrapped = "function b() { not_exit() }";
  var wrapped_node = parse(wrapped).body[0];

  it('should return a boolean', function(){
    utils.has_exit().should.be.a('boolean');
    utils.has_exit(exit_node).should.be.a('boolean');
    utils.has_exit(wrapped_node).should.be.a('boolean');
  });

  it('should return true for code that contains an exit', function(){
    utils.has_exit(exit_node).should.be.true;
    utils.has_exit(wrapped_node, ['not_exit']).should.be.true;
  });

  it('should return false for code that does not contain an exit', function(){
    utils.has_exit(wrapped_node).should.be.false;
    utils.has_exit(wrapped_node, ['something']).should.be.false;
  });
});

describe('utils.nodes_equal', function(){
  var range1 = [1,2];
  var range2 = [1,3];
  var range3 = [0,2];

  var node1 = {
    'range': range1,
  };
  var node2 = {
    'range': range2,
  };
  var node3 = {
    'range': range3,
  };

  it('should return true for two nodes with the same range', function(){
    var equivalent = utils.nodes_equal(node1, node1);
    expect(equivalent).to.be.true;
  });

  it('should return false for two nodes that end at different places', function(){
    var equivalent = utils.nodes_equal(node1, node2);
    expect(equivalent).to.be.false;
  });

  it('should return false for two nodes that begin at different places', function(){
    var equivalent = utils.nodes_equal(node1, node3);
    expect(equivalent).to.be.false;
  });
});

describe('utils.check_functions', function(){
  var code = fs.readFileSync(fix_dir + 'wrapped_function.js', 'utf8');
  var node = parse(code);

  it('should return an array', function(){
    utils.check_functions().should.be.an('array');
    utils.check_functions(node).should.be.an('array');
    utils.check_functions(node, ['something']).should.be.an('array');
  });

  it('should return those functions that always exit', function(){
    var result = utils.check_functions(node);
    result.should.have.length(1);
    result.should.include('my_function');
  });
});

describe('utils.variables_equivalent', function(){
  var node1 = {
    'name': 'node1',
    'type': 'Node'
  };
  var node2 = {
    'name': 'node2',
    'type': 'Node'
  };
  var node3 = {
    'name': 'node1',
    'type': 'NotANode'
  };

  it('should return true for two equivalent variable nodes', function(){
    utils.variables_equivalent(node1, node1).should.be.true;
  });

  it('should return false for two nodes with different types or names', function(){
    utils.variables_equivalent(node1, node2).should.be.false;
    utils.variables_equivalent(node1, node3).should.be.false;
    utils.variables_equivalent(node2, node3).should.be.false;
  });
});

describe('utils.get_first_function', function(){
  var code = "function a(){ return;} a().b().c();";
  var node = parse(code);

  it('should return the first function call', function(){
    var first = utils.get_first_function(node.body[1].expression);
    var actual = node.body[1].expression.callee.object.callee.object.callee;
    first.should.deep.equal(actual);
  });
});

describe('utils.get_all_functions', function(){
  var code = "function a(){ return;} a().b().c();";
  var node = parse(code);

  it('should return an array of the function calls', function(){
    var calls = utils.get_all_functions(node.body[1].expression);
    var first = node.body[1].expression.callee.object.callee.object.callee;
    var second = {
      'property': node.body[1].expression.callee.object.callee.property,
      'arguments': [],
    };
    var third = {
      'property': node.body[1].expression.callee.property,
      'arguments': [],
    };

    calls.should.be.an('array').with.length(3);
    calls[0].should.deep.equal(first);
    calls[1].should.deep.equal(second);
    calls[2].should.deep.equal(third);
  });
});

describe('utils.test_if', function(){
  var if_code = fs.readFileSync(fix_dir + 'if_snippet.js', 'utf8');
  var if_node = parse(if_code);

  it('should ignore unrelated ifs', function(){
    var fake_err = {
      'type': 'Identifier',
      'name': 'err',
    };
    var result = utils.test_if(if_node.body[0], fake_err, []);

    result.should.have.property('err_exits');
    result.err_exits.should.be.false;

    result.should.have.property('err_caught');
    result.err_caught.should.be.false;
  });

  it('should recognize err handling', function(){
    var matching_err = {
      'type': 'Identifier',
      'name': 'a',
    };
    var result = utils.test_if(if_node.body[0], matching_err, []);

    result.should.have.property('err_exits');
    result.err_exits.should.be.true;

    result.should.have.property('err_caught');
    result.err_caught.should.be.true;
  });
});

var walker = require('../lib/walker.js');
describe('walker.walk', function(){
  var boring_code = fs.readFileSync(fix_dir + 'boring.js', 'utf8');
  var boring_node = parse(boring_code);
  var syntax = walker.syntax();

  it('should call the parser param on each relevant child', function(){
    var parser = function(a){
      return a;
    };

    parser = sinon.spy(parser);
    var walked = walker.walk(boring_node, parser, syntax);
    parser.called.should.be.true;
    parser.callCount.should.equal(walked.length);

    for (var i = 0; i < walked.length; i++) {
      parser.calledWith(walked[i]).should.be.true;
    }
  });
});

var conditional = require('../lib/conditional.js');
describe('conditional.test', function(){
  var conditional_code = fs.readFileSync(fix_dir + 'if_snippet.js', 'utf8');
  var if_node = parse(conditional_code).body[0];
  var switch_code = fs.readFileSync(fix_dir + 'switch_snippet.js', 'utf8');
  var switch_node = parse(switch_code).body[0];

  it('should put all exiting children in the `exits` property', function(){
    var result = conditional.test(if_node, [], conditional_code);
    result.should.have.property('exits').with.length(1);
    result.exits.should.deep.include(if_node.consequent);

    result = conditional.test(switch_node, [], switch_code);
    result.should.have.property('exits').with.length(1);
    result.exits.should.deep.include(switch_node.cases[2]);
  });

  it('should put all not-exiting children in the `non_exits` property', function(){
    var result = conditional.test(if_node, [], conditional_code);
    result.should.have.property('non_exits').with.length(1);
    result.non_exits.should.deep.include(if_node.alternate);

    result = conditional.test(switch_node, [], switch_code);
    result.should.have.property('non_exits').with.length(2);
    result.non_exits.should.deep.include(switch_node.cases[0]);
    result.non_exits.should.deep.include(switch_node.cases[1]);
  });
});

var callback = require('../lib/callback.js');
describe('callback.test_declaration', function(){
  var callback_node = parse(callback_code);

  it('should return nothing for functions that don\'t use callbacks', function(){
    var code = fs.readFileSync(fix_dir + 'wrapped_function.js', 'utf8');
    var node = parse(code).body[0];
    var test = callback.test_declaration(node);
    expect(test).to.be.undefined;
  });

  it('should populate the correct properties for callback functions', function(){
    var node = callback_node.body[3];
    var test = callback.test_declaration(node);

    test.should.have.property('success_found');
    test.success_found.should.be.true;

    test.should.have.property('success_exits');
    test.success_exits.should.be.false;

    test.should.have.property('success_call_index');
    test.success_call_index.should.equal(1);

    test.should.have.property('error_found');
    test.error_found.should.be.true;

    test.should.have.property('error_exits');
    test.error_exits.should.be.false;

    test.should.have.property('error_call_index');
    test.error_call_index.should.equal(1);

    test.should.have.property('error_param');
    test.error_param.should.have.property('index');
    test.error_param.index.should.equal(1);
    test.error_param.should.have.property('args_passed');
    var args_passed = node.body.body[0].expression.arguments[1].body.body[0].expression.arguments;
    test.error_param.args_passed.should.deep.equal(args_passed);
  });
});

describe('callback.test', function(){
  var callback_node = parse(callback_code);

  it('should only return something if given an expression statement', function(){
    var result = callback.test(callback_node, []);
    expect(result).to.be.undefined;
  });

  it('should correctly populate the result object', function(){
    var node = callback_node.body[4];
    var callbacks = [callback.test_declaration(callback_node.body[3])];
    var result = callback.test(node, callbacks);

    result.should.have.property('success_found');
    result.success_found.should.be.true;

    result.should.have.property('success_exits');
    result.success_exits.should.be.true;

    result.should.have.property('error_found');
    result.error_found.should.be.true;

    result.should.have.property('error_exits');
    result.error_exits.should.be.false;

    result.should.have.property('node');
    result.node.should.deep.equal(node);
  });
});

var promise = require('../lib/promise.js');
describe('promise.test', function(){
  var promise_node = parse(promise_code);

  it('should return an array given a good esprima node', function(){
    promise.test(promise_node).should.be.an('array');
  });

  describe('each object in the array', function(){
    it('should have the correct properties', function(){
      var result = promise.test(promise_node);
      result.should.have.length(2);
      result[0].should.have.property('all_funcs').with.length(6);
      result[0].should.have.property('last_caught_index');
      result[0].should.have.property('last_caught_exit_index');
      result[0].should.have.property('last_run_index');
      result[0].should.have.property('last_run_exit_index');
      result[0].should.have.property('promise');

      result[1].should.have.property('all_funcs').with.length(5);
      result[1].should.have.property('last_caught_index');
      result[1].should.have.property('last_caught_exit_index');
      result[1].should.have.property('last_run_index');
      result[1].should.have.property('last_run_exit_index');
      result[1].should.have.property('promise');
    });
    
    it('should indicate whether fully successful code exit', function(){
      var result = promise.test(promise_node);

      result[0].should.have.property('last_run_index');
      result[0].last_run_index.should.equal(5);

      result[0].should.have.property('last_run_exit_index');
      result[0].last_run_exit_index.should.equal(5);

      result[1].should.have.property('last_run_index');
      result[1].last_run_index.should.equal(4);

      result[1].should.have.property('last_run_exit_index');
      result[1].last_run_exit_index.should.equal(2);
    });

    it('should indicate whether erroring code exits', function(){
      var result = promise.test(promise_node);

      result[0].should.have.property('last_caught_index');
      result[0].last_caught_index.should.equal(4);

      result[0].should.have.property('last_caught_exit_index');
      result[0].last_caught_exit_index.should.equal(0);

      result[1].should.have.property('last_caught_index');
      result[1].last_caught_index.should.equal(4);

      result[1].should.have.property('last_run_exit_index');
      result[1].last_run_exit_index.should.equal(2);
    });
  });
});

var main = require('../lib/index.js');
describe('test_string', function(){
  var boring_code = fs.readFileSync(fix_dir + 'boring.js', 'utf8');
  var boring_nodes = parse(boring_code);

  var exiting_code = fs.readFileSync(fix_dir + 'fully_exiting_snippet.js', 'utf8');

  it('should parse the string using esprima', function(){
    sinon.spy(esprima, 'parse');
    main.test_string(boring_code);
    esprima.parse.called.should.be.true;
    esprima.parse.calledWith(boring_code, {
      loc: true,
      range: true,
    }).should.be.true;
    esprima.parse.restore();
  });

  it('should check global nodes for exit calls', function(){
    sinon.spy(utils, 'is_exit');
    main.test_string(boring_code);
    utils.is_exit.callCount.should.equal(boring_nodes.body.length);
    utils.is_exit.restore();
  });

  it('should check all function declarations for callbacks', function(){
    sinon.spy(callback, 'test_declaration');
    main.test_string(callback_code);
    callback.test_declaration.calledTwice.should.be.true;
    callback.test_declaration.calledWith(parse(callback_code).body[1]).should.be.true;
    callback.test_declaration.calledWith(parse(callback_code).body[3]).should.be.true;
    callback.test_declaration.restore();
  });

  it('should check conditionals', function(){
    sinon.spy(conditional, 'test');

    main.test_string(conditional_code);
    conditional.test.called.should.be.true;

    conditional.test.restore();
  });

  it('should check promises', function(){
    sinon.spy(promise, 'test');

    main.test_string(conditional_code);
    promise.test.called.should.be.true;
    promise.test.restore();
  });

  it('should check callbacks', function(){
    sinon.spy(callback, 'test');
    sinon.spy(callback, 'test_declaration');

    main.test_string(callback_code);
    callback.test_declaration.calledTwice.should.be.true;
    callback.test.called.should.be.true;

    callback.test.restore();
    callback.test_declaration.restore();
  });

  it('should respect the json option', function(){
    var result = main.test_string(conditional_code, {
      'json': true,
    });
    result.should.be.an('object');
    result.should.have.property('global_exit');
    result.should.have.property('conditionals');
    result.should.have.property('promises');
    result.should.have.property('callbacks');
    result.should.deep.equal(conditional_json);

    result = main.test_string(exiting_code, {
      'json': false,
    });
    result.should.be.a('string');
    result.should.equal('Hooray! Your code contains a global exit.');

    result = main.test_string(conditional_code, {
      'json': false
    });
    result.should.be.a('string');
    result.should.equal(conditional_string);
  });

  it('should respect the zero_index option', function(){
    var result = main.test_string(conditional_code, {
      'json': true,
      'zero_index': true,
    });

    var one_index = conditional_json.conditionals.need_exits;
    var zero_index = result.conditionals.need_exits;

    for (var i = 0; i < zero_index.length; i++){
      zero_index[i].line.should.equal(one_index[i].line - 1);
    }

    result = main.test_string(callback_code, {
      'json': true,
      'zero_index': true,
    })
    one_index = callback_json.callbacks.need_exits;
    zero_index = result.callbacks.need_exits;

    for (i = 0; i < zero_index.length; i++){
      zero_index[i].line.should.equal(one_index[i].line - 1);
    }
    
    result = main.test_string(promise_code, {
      'json': true,
      'zero_index': true,
    });
    one_index = promise_json.promises.need_exits;
    zero_index = result.promises.need_exits;

    for (i = 0; i < zero_index.length; i++){
      zero_index[i].line.should.equal(one_index[i].line - 1);
    }

    result = main.test_string(conditional_code, {
      'json': true,
      'zero_index': false,
    });
    result.should.deep.equal(conditional_json);
  });

  it('should correctly format conditional output', function(){
    var result = main.test_string(conditional_code);
    result.should.be.a('string');
    result.should.equal(conditional_string);

    sinon.spy(conditional, 'reduce');
    result = main.test_string(conditional_code, {
      'json': true,
    });
    conditional.reduce.calledOnce.should.be.true;
    conditional.reduce.restore();

    result.should.be.an('object');
    result.should.deep.equal(conditional_json);
  });

  it('should correctly format callback output', function(){
    var result = main.test_string(callback_code);
    result.should.be.a('string');
    result.should.equal(callback_string);

    sinon.spy(callback, 'reduce');
    result = main.test_string(callback_code, {
      'json': true,
    });
    callback.reduce.calledOnce.should.be.true;
    callback.reduce.restore();

    result.should.be.an('object');
    result.should.deep.equal(callback_json);
  });

  it('should correctly format promise output', function(){
    var result = main.test_string(promise_code);
    result.should.be.a('string');
    result.should.equal(promise_string);

    sinon.spy(promise, 'reduce');
    result = main.test_string(promise_code, {
      'json': true,
    });
    promise.reduce.calledOnce.should.be.true;
    promise.reduce.restore();

    result.should.be.an('object');
    result.should.deep.equal(promise_json);
  });
});

describe('test_file', function(){

  it('should provide a useful error if no filename', function(){
    expect(function(){
      main.test_file();
    }).to.throw('No file name supplied.');
  });

  it('should respect the json option', function(){
    var result = main.test_file(fix_dir + 'wrapped_function.js', {
      'json': false
    });

    result.should.be.a('string');
    result.should.equal('Hooray! Your code will always exit.');

    result = main.test_file(ex_dir + 'conditional_code.js', {
      'json': true
    });

    result.should.be.an('object');
    result.should.have.property('global_exit');
    result.should.have.property('conditionals');
    result.should.have.property('callbacks');
    result.should.have.property('promises');

    result.should.deep.equal(conditional_json);
  });

  it('should respect the zero_index option', function(){
    var result = main.test_file(ex_dir + 'callback_code.js', {
      'zero_index': false,
    });

    result.should.deep.equal(callback_string);

    // it's just much easier to check zero_index with JSON
    result = main.test_file(ex_dir + 'promise_code.js', {
      'json': true,
      'zero_index': true,
    });

    var one_index = promise_json.promises.need_exits;
    var zero_index = result.promises.need_exits;

    for (var i = 0; i < zero_index.length; i++){
      zero_index[i].line.should.equal(one_index[i].line - 1);
    }

  });
});

