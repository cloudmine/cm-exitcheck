var utils = require('./utils.js')

function test_callbacks(node, exiting_functions, params){
   /*
      Tests callbacks supplied as params for exit calls.

      @param node: an esprima node
      @param exiting_functions: the names of functions that fully exit
      @param params: an optional param of the previous params for the function 
         represented by `node` 

      @return: boolean of whether any of the callback fcns exit
   */
   if (!(params)){
      params = {};
   }

   var str = "";
   var callback_exits = false;

   if (node.type === 'ExpressionStatement'){
      str += test_callbacks(node.expression, exiting_functions, params).cmd
   } else if (node.type === 'CallExpression'){
      for (var i = 0; i < node.arguments.length; i++) {
         if (utils.is_exit(node.arguments[i])){
            callback_exits = true;
         } else{
            if (node.arguments[i].type === 'FunctionExpression'){
               var body = node.arguments[i].body;
               for (var j = 0; j < body.length; j++) {
                  if (utils.is_exit(body[j])){
                     callback_exits = true;
                  } else if (body[j].type === 'ExpressionStatement' || body[j].type === 'FunctionExpression' && !callback_exits){
                     callback_exits = test_callbacks(body[j]);
                  }
               }
            }
         }
      }
   }

   return callback_exits;
}
module.exports = {
   'test': test_callbacks,
}