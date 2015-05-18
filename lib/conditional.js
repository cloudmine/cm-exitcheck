'use strict';
var utils = require('./utils.js');

function add_condition(block, condition){
   /*
      Adds a condition to a block and its children if relevant.

      @param block: an esprima node
      @param condition: a string to set as condition property
   */
   if (block.type === 'BlockStatement' || block.type === 'ForStatment'){
      for (var i = 0; i < block.body.length; i++) {
         block.body[i].condition = condition;
      }
   }

   block.condition = condition;
}

function get_children_with_condition(node, filetext){
   /*
      Gets the relevant child nodes and adds the relevant condition.
      - For an if statement, returns the if and else blocks.
      - For a switch statement, returns all cases.

      @param node: an esprima node
      @param filetext: the string of the complete code from which `node` was 
         parsed

      @return: a list of all relevant child nodes each with an additional 
         `condition` property, a readable string of the truth values required 
         to reach the node
   */
   var nodes = [];
   var test;

   if (node.type === 'IfStatement'){
      if (node.condition){
         test = node.condition + ', and if ';
      } else{
         test = 'if ';
      }
      test += utils.get_original_node(node.test, filetext);

      add_condition(node.consequent, test + ' is true');
      nodes.push(node.consequent);


      if (node.alternate){
         add_condition(node.alternate, test + ' is false');
         if (node.alternate.type !== 'IfStatement' && node.alternate.type !== 'SwitchStatement'){
            // so we don't duplicate things we are seeing later
            nodes.push(node.alternate);
         }
      }
   } else if (node.type === 'SwitchStatement'){
      nodes = node.cases;
      test = 'if ' + utils.get_original_node(node.discriminant, filetext);
      for (var i = 0; i < node.cases.length; i++) {
         if (node.cases[i].test !== null){
            var this_test = utils.get_original_node(node.cases[i].test, filetext);
            add_condition(node.cases[i], test + ' is ' + this_test);
         } else{
            add_condition(node.cases[i], test + ' falls through to default');
         }
      }
   }

   for (var j = 0; j < nodes.length; j++) {
      nodes[j].parent = node;
   }

   return nodes;
}

function test_conditionals(parent, exiting_functions, filetext){
   /*
      Get all of a node's children, sorted based on whether they exit. 

      @param parent: an esprima node
      @param exiting_functions: an array of names of functions that exit
      @param filetext: the string of the complete code from which `parent` was 
         parsed

      @return: if there is anything to return, an object with these properties:
         `exits`: those nodes that exit
         `non_exits`: those nodes that do not exit
   */
   var nodes = get_children_with_condition(parent, filetext);
   var exits = [];
   var non_exits = [];

   for (var i = 0; i < nodes.length; i++){
      var node = nodes[i];
      var exited = false;

      if (node.type === 'BlockStatement'){
         for (var j = 0; j < node.body.length; j++){
            if (node.body[j].type === 'ExpressionStatement'){
               if (utils.is_exit(node.body[j], exiting_functions)){
                  exited = true;
                  break;
               }
            }
         }
      } else {
         if (node.type === 'ExpressionStatement'){
            if (utils.is_exit(node, exiting_functions)){
               exited = true;
            }
         }
         if (node.type === 'SwitchCase'){
            var consequent = node.consequent;
            for (var k = 0; k < consequent.length; k++){
               if (utils.is_exit(consequent[k], exiting_functions)){
                  exited = true;
                  break;
               }
            }
         }
      }

      if (exited){
         exits.push(node);
      } else {
         non_exits.push(node);
      }
   }

   if (exits.length || non_exits.length){
      return {
         'exits': exits,
         'non_exits': non_exits,
         'type': 'conditional'
      };
   }
}

function matching_cond(condition){
   /*
      Extracts condition minus final truth value.

      @param condition: a string of a conditional statement

      @return: a string of `condition` minus the last "true" or "false" in it
   */
   if (condition.lastIndexOf("true") === condition.length - 4){
      return condition.slice(0, -4);
   } else if (condition.lastIndexOf("false") === condition.length - 5){
      return condition.slice(0, -5);
   }
   return condition;
}

function first_cond(condition){
   /*
      Separates the first condition from compound condition statements.

      @param condition: a string of a possibly compound conditional statement

      @return: the `matching_cond` value for the first conditional statement
   */
   if (condition.indexOf(', and if ') > 0){
      return matching_cond(condition.slice(0, condition.indexOf(', and if ')));
   }
   return matching_cond(condition);
}

function reduce(all_results){
   /*
      Reduces an array of objects from test_conditionals into a single object with a list of the exiting nodes and a list of the non exiting nodes.

      @param all_results: an array of objects each with an 'exits' and 
         'non_exits' property (i.e. multiple results of test_conditionals)

      @return: an object with a single 'exits' and 'non_exits' property
   */
   var exits = [];
   var non_exits = [];
   var j = 0; // so linter stops complaining

   for (var i = 0; i < all_results.length; i++) {
      for (j = 0; j < all_results[i].exits.length; j++) {
         exits.push({
            'condition': all_results[i].exits[j].condition,
            'loc': all_results[i].exits[j].loc,
         });
      }
      for (j = 0; j < all_results[i].non_exits.length; j++) {
         non_exits.push({
            'condition': all_results[i].non_exits[j].condition,
            'loc': all_results[i].non_exits[j].loc,
         });
      }
   }

   // remove nested conditionals if the parent condtional exits
   for (i = 0; i < exits.length; i++) {
      for (j = 0; j < exits.length; j++) {
         if (i !== j){
            if (exits[j].condition.indexOf(exits[i].condition) === 0){
               exits.splice(j, 1);
            }
         }
      }
      for (j = 0; j < non_exits.length; j++){
         if (non_exits[j].condition.indexOf(exits[i].condition) === 0){
            non_exits.splice(j, 1);
         }
      }
   }

   // remove conditionals that never exit
   for (i = 0; i < non_exits.length; i++) {
      var cond = matching_cond(non_exits[i].condition);
      
      // true and false don't exit
      for (j = i + 1; j < non_exits.length; j++) {
         if (cond === matching_cond(non_exits[j].condition)){
            non_exits.splice(j, 1);
            non_exits.splice(i, 1);
            i = 0;
            break;
         }
      }

      var other_exits = false;
      for (j = 0; j < exits.length; j++){
         // if (!())
         if (cond === first_cond(exits[j].condition)){
            // console.log("true/false pair:", non_exits[i].condition, "\t", exits[j].condition);
            other_exits = true;
         } else if (cond ===  matching_cond(exits[j].condition)){
            other_exits = true;
         }
      }

      if (!(other_exits) && cond !== non_exits[i].condition){
         // there's only one version of this conditional, and it doesn't exit
         non_exits.splice(i);
         // console.log("only one of", non_exits[i].condition);
         // console.log("cond", cond);
      }
   }

   return {
      'exits': exits,
      'non_exits': non_exits,
   };
}

function output_string(result){
   /*
      Turns the result of `reduce` into an easy-to-understand string.

      @param result: a single object with an `exits` and a `non_exits` property that is the result of a call to `reduce`

      @return: a string which explains any errors in code, or says there are none
   */
   if (result.non_exits.length){
      var str = "Your code does not contain an exit under the following conditions:\n\n";
      for (var i = 0; i < result.non_exits.length; i++) {
         if (i !== 0){
            str += "\n";
         }
         str += "  - " + result.non_exits[i].condition;
         var start = result.non_exits[i].loc.start.line;
         var end = result.non_exits[i].loc.end.line;
         str += "\n    lines " + start + "-" + end;
      }
      return str;
   } else{
      if (result.exits.length){
         return "Hooray! Your code will always exit.";
      } else{
         return "Your code never exits. Adding an `exit()` call to the end of your code will prevent the process from hanging.";
      }
   }
}

module.exports = {
   'test': test_conditionals,
   'reduce': reduce,
   'output': output_string,
};