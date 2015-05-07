'use strict';
var chai = require('chai');
var should = chai.should();
var expect = chai.expect;
var assert = chai.assert;
var sinon = require('sinon');
var fs = require('fs');
var dir = './test/fixtures/'
var esprima = require('esprima');

function parse(code_to_parse){
   return esprima.parse(code_to_parse, {
      'range': true,
      'loc': true,
   })
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

});

describe('utils.check_functions', function(){

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
   
});

var promise = require('../lib/promise.js');
describe('promise.test', function(){

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

