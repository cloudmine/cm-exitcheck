'use strict';
var chai = require('chai');
var should = chai.should();
var expect = chai.expect;
var sinon = require('sinon');
var fs = require('fs');
var dir = './test/fixtures/'
var esprima = require('esprima');

function parse(code_to_parse){
   // so I don't have to specific the esprima params every time
   return esprima.parse(code_to_parse, {
      'range': true,
      'loc': true,
   });
}

var utils = require('../lib/utils.js');
describe('utils.is_exit', function(){
   var exit_code = "exit();"
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
   })

   it('should return false for other function calls', function(){
      expect(utils.is_exit(not_exit_node)).to.be.false;
   })

   it('should return false for non function calls', function(){
      expect(utils.is_exit(not_fcn_node)).to.be.false;
   })
});

describe('utils.has_exit', function(){
   var exit = "function a(){exit();}";
   var exit_node = parse(exit).body[0];
   var wrapped = "function b() { not_exit() }"
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
   }
   var node2 = {
      'range': range2,
   }
   var node3 = {
      'range': range3,
   }

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
   })
});

describe('utils.sort', function(){
   var if_code = fs.readFileSync(dir + 'if_snippet.js', 'utf-8');
   var if_node = parse(if_code).body[0];
   var switch_code = fs.readFileSync(dir + 'switch_snippet.js', 'utf-8');
   var switch_node = parse(switch_code).body[0];

   it('should put all exiting children in the `exits` property', function(){
      var result = utils.sort(if_node, [], if_code);
      result.should.have.property('exits').with.length(1);
      result.exits.should.deep.include(if_node.consequent);

      result = utils.sort(switch_node, [], switch_code);
      result.should.have.property('exits').with.length(1);
      result.exits.should.deep.include(switch_node.cases[2]);
   });

   it('should put all not-exiting children in the `non_exits` property', function(){
      var result = utils.sort(if_node, [], if_code);
      result.should.have.property('non_exits').with.length(1);
      result.non_exits.should.deep.include(if_node.alternate);

      result = utils.sort(switch_node, [], switch_code);
      result.should.have.property('non_exits').with.length(2);
      result.non_exits.should.deep.include(switch_node.cases[0]);
      result.non_exits.should.deep.include(switch_node.cases[1]);
   });
});

describe('utils.check_functions', function(){
   var code = fs.readFileSync(dir + 'wrapped_function.js', 'utf-8');
   var node = parse(code);

   it('should return an array', function(){
      utils.check_functions().should.be.an('array');
      utils.check_functions(node).should.be.an('array');
      utils.check_functions(node, ['something']).should.be.an('array')
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
   }
   var node2 = {
      'name': 'node2',
      'type': 'Node'
   }
   var node3 = {
      'name': 'node1',
      'type': 'NotANode'
   }

   it('should return true for two equivalent variable nodes', function(){
      utils.variables_equivalent(node1, node1).should.be.true;
   });

   it('should return false for two nodes with different types or names', function(){
      utils.variables_equivalent(node1, node2).should.be.false;
      utils.variables_equivalent(node1, node3).should.be.false;
      utils.variables_equivalent(node2, node3).should.be.false;
   });
});

var walker = require('../lib/walker.js');
describe('walker.walk', function(){
   var boring_code = fs.readFileSync(dir + 'boring.js', 'utf-8');
   var boring_node = parse(boring_code);
   var if_code = fs.readFileSync(dir + 'if_snippet.js', 'utf-8');
   var if_node = parse(if_code);
   var switch_code = fs.readFileSync(dir + 'switch_snippet.js', 'utf-8');
   var switch_node = parse(switch_code);
   var syntax = walker.syntax();

   it('should return an empty array for nodes without relevant children', function(){
      var walked = walker.walk(boring_node);
      walked.should.deep.equal([]);
   });

   it('should return objects with an `exits` property of exiting nodes', function(){
      var walked = walker.walk(if_node, if_code, syntax, [])[0];
      walked.should.have.property('exits').with.length(1);
      walked.exits.should.include(if_node.body[0].consequent)

      walked = walker.walk(switch_node, switch_code, syntax, [])[0];
      walked.should.have.property('exits').with.length(1);
      walked.exits.should.include(switch_node.body[0].cases[2]);
   });

   it('should return objects with a `non_exits` property of not exiting nodes', function(){
      var walked = walker.walk(if_node, if_code, syntax, [])[0];
      walked.should.have.property('non_exits').with.length(1);
      walked.non_exits[0].should.deep.equal(if_node.body[0].alternate);

      walked = walker.walk(switch_node, switch_code, syntax, [])[0];
      walked.should.have.property('non_exits').with.length(2);
      walked.non_exits.should.include(switch_node.body[0].cases[0]);
      walked.non_exits.should.include(switch_node.body[0].cases[1]);
   });
});

var callback = require('../lib/callback.js');
describe('callback.test', function(){
   var callback_code = fs.readFileSync(dir + 'callback_hell.js', 'utf-8');
   var callback_node = parse(callback_code).body[3];

   it('should return an array with each callback function', function(){
      callback.test(callback_node).should.be.an('array').with.length(4);
   });

   it('should indicate whether each callback exits', function(){
      var result = callback.test(callback_node);
      result[0].should.have.property('exits');
      result[0].exits.should.be.false;
      result[1].should.have.property('exits');
      result[1].exits.should.be.false;
      result[2].should.have.property('exits');
      result[2].exits.should.be.false;
      result[3].should.have.property('exits');
      result[3].exits.should.be.true;
   });

   it('should indicate if each callback had error handling', function(){
      var result = callback.test(callback_node);
      result[0].should.have.property('err');
      result[1].should.have.property('err');
      result[2].should.have.property('err');
      result[3].should.not.have.property('err');
   });

   it('should indicate if each callback error handling exited', function(){
      var result = callback.test(callback_node);
      result[0].should.have.property('err_exits');
      result[0].err_exits.should.be.false;
      result[1].should.have.property('err_exits');
      result[1].err_exits.should.be.true;
      result[2].should.have.property('err_exits');
      result[2].err_exits.should.be.true;
      result[3].should.not.have.property('err_exits');
   });
});

var promise = require('../lib/promise.js');
describe('promise.test', function(){
   var promise_code = fs.readFileSync(dir + 'promise_fun.js', 'utf-8');
   var promise_node = parse(promise_code);

   it('should return an array given a good esprima node', function(){
      promise.test(promise_node).should.be.an('array');
   });

   describe('each object in the array', function(){
      it('should have the correct properties', function(){
         var result = promise.test(promise_node);
         result.should.have.length(1);
         result[0].should.have.property('all_funcs').with.length(6);
         result[0].should.have.property('last_caught_index')
         result[0].should.have.property('last_caught_exit_index');
         result[0].should.have.property('last_run_index');
         result[0].should.have.property('last_run_exit_index');
         result[0].should.have.property('promise');
      });
      
      it('should indicate whether fully successful code exit', function(){
         var result = promise.test(promise_node);

         result[0].should.have.property('last_run_index');
         result[0].last_run_index.should.equal(5);

         result[0].should.have.property('last_run_exit_index');
         result[0].last_run_exit_index.should.equal(5);
      });

      it('should indicate whether erroring code exits', function(){
         var result = promise.test(promise_node);

         result[0].should.have.property('last_caught_index')
         result[0].last_caught_index.should.equal(4);

         result[0].should.have.property('last_caught_exit_index');
         result[0].last_caught_exit_index.should.equal(0);
      });
   })
});

var main = require('../lib/index.js');
describe('test_string', function(){
   var boring_code = fs.readFileSync(dir + 'boring.js', 'utf-8');
   var boring_nodes = parse(boring_code);

   var exiting_code = fs.readFileSync(dir + 'fully_exiting_snippet.js', 'utf-8');
   var exit_block = parse(exiting_code).body[3];

   var code = fs.readFileSync(dir + 'snippet.js', 'utf-8');
   var string_output = fs.readFileSync(dir + 'string_output.txt', 'utf-8');
   var json_output = JSON.parse(fs.readFileSync(dir + 'output.json', 'utf-8'));

   it('should parse the string using esprima', function(){
      sinon.spy(esprima, 'parse');
      main.test_string(boring_code);
      esprima.parse.called.should.be.true;
      esprima.parse.restore();
   });

   it('should check global nodes for exit calls', function(){
      sinon.spy(utils, 'is_exit');
      main.test_string(boring_code);
      utils.is_exit.callCount.should.equal(boring_nodes.body.length);
      utils.is_exit.restore();
   });

   it('should walk each global node', function(){
      sinon.spy(walker, 'walk');
      main.test_string(boring_code);
      walker.walk.callCount.should.equal(boring_nodes.body.length);
      walker.walk.restore();
   });

   it('should check promises', function(){
      sinon.spy(promise, 'test');
      main.test_string(boring_code);
      promise.test.calledOnce.should.be.true;
      promise.test.calledWith(boring_nodes).should.be.true;
      promise.test.restore();
   });

   it('should check callbacks', function(){
      sinon.spy(callback, 'test');
      main.test_string(boring_code);
      callback.test.callCount.should.equal(boring_nodes.body.length);
      callback.test.restore();
   });

   it('should respect the json option', function(){
      var parsed = main.test_string(code, {
         'json': true,
      });
      parsed.should.be.an('object');
      parsed.should.have.property('exits');
      parsed.should.have.property('non_exits');
      parsed.should.have.property('global_exits');
      parsed.should.deep.equal(json_output);

      parsed = main.test_string(exiting_code, {
         'json': false,
      });
      parsed.should.be.a('string');
      parsed.should.equal('Hooray! Your code contains a global exit.')

      parsed = main.test_string(code, {
         'json': false
      });
      parsed.should.equal(string_output)
   });
});

describe('test_file', function(){
   var json_output = JSON.parse(fs.readFileSync(dir + 'output.json', 'utf-8'));

   it('should provide a useful error if no filename', function(){
      expect(function(){
         main.test_file()
      }).to.throw('No file name supplied.');
   });

   it('should respect the json option', function(){
      var parsed = main.test_file(dir + 'wrapped_function.js', {
         'json': false
      });

      parsed.should.be.a('string');
      parsed.should.equal('Hooray! Your code will always exit.');

      parsed = main.test_file(dir + 'snippet.js', {
         'json': true
      });

      parsed.should.be.an('object');
      parsed.should.have.property('exits');
      parsed.should.have.property('non_exits');
      parsed.should.have.property('global_exits');
      parsed.should.deep.equal(json_output);
   });
});

