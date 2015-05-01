var esprima = require('esprima');
var fs = require('fs');
var utils = require('./utils.js');

function get_qs(node){
   var vars = [];
   for (var i = 0; i < node.body.length; i++) {
      var block = node.body[i];
      if (block.type === 'VariableDeclaration'){
         for (var j = 0; j < block.declarations.length; j++) {
            if (block.declarations[j].init.type === 'CallExpression'){
               var callee = block.declarations[j].init.callee;
               if (callee.type === 'Identifier' && callee.name === 'require'){
                  var first_arg = block.declarations[j].init.arguments[0];
                  if (first_arg.type === 'Literal' && first_arg.value === 'q'){
                     vars.push(block.declarations[j].id);
                  }
               }
            }
         }
      }
   }

   return vars;
}

function variables_equal(var1, var2){
   if (var1.type === var2.type && var1.name === var2.name){
      return true;
   } else {
      return false;
   }
}

function is_defer(q_vars, callee){
   var defer_var = {
      'type': 'Identifier',
      'name': 'defer',
   }
   for (var i = 0; i < q_vars.length; i++) {
      if (variables_equal(q_vars[i], callee.object)){
         if (variables_equal(callee.property, defer_var)){
            return true;
         }
      }
   }

   return false;
}

function is_promise(defer_var, argument){
   var promise_var = {
      'type': 'Identifier',
      'name': 'promise',
   }

   if (variables_equal(argument.object, defer_var)){
      if (variables_equal(argument.property, promise_var)){
         return true;
      }
   }

   return false;
}

function returns_promise(node, q_vars){
   var defer;

   for (var i = 0; i < node.body.length; i++) {
      if (node.body[i].type === 'VariableDeclaration'){
         for (var j = 0; j < node.body[i].declarations.length; j++) {
            var callee = node.body[i].declarations[j].init.callee;
            if (is_defer(q_vars, callee)){
               defer = node.body[i].declarations[j].id;
            }
         }
      }
      if (defer && node.body[i].type === 'ReturnStatement'){
         if (is_promise(defer, node.body[i].argument)){
            return true;
         }
      }
   }

   return false;
}

function check_function_decs(node, q_vars){
   var funcs = [];

   for (var i = 0; i < node.body.length; i++) {
      var block = node.body[i];
      if (block.type === 'FunctionDeclaration'){
         var local_qs = q_vars.concat(get_qs(block.body));
         if (returns_promise(block.body, local_qs)){
            funcs.push(block.id);
         }
      }
   }

   return funcs;
}

function get_first_function(expr){
   var all = get_all_functions(expr);
   if (all.length){
      return all[0];
   } else{
      return null;
   }
}

function get_all_functions(expr){
   var funcs = [];
   if (expr.type === 'CallExpression'){
      if (expr.callee.type === 'CallExpression' || expr.callee.type === 'MemberExpression'){
         funcs = get_all_functions(expr.callee);
         var prop = {
            'property': expr.callee.property,
            'arguments': expr.arguments,
         }
         funcs.push(prop);
      } else{
         funcs.push(expr.callee);
      }
   } else if (expr.type === 'MemberExpression'){
      if (expr.object.type === 'CallExpression' || expr.object.type === 'MemberExpression'){
         funcs = get_all_functions(expr.object);
      } else{
         funcs.push(expr.object);
      }
   }

   return funcs;
}

function check_function_calls(program, promise_funcs){
   for (var i = 0; i < program.body.length; i++) {
      if (program.body[i].type === 'ExpressionStatement'){
         if (program.body[i].expression.type === 'CallExpression'){
            var callee = program.body[i].expression.callee;
            var first_func = get_first_function(callee);
            var promise = false;
            for (var j = 0; j < promise_funcs.length; j++) {
               if (variables_equal(promise_funcs[j], first_func)){
                  promise = true;
                  break;
               }
            }
            if (promise){
               parse_promise_methods(program.body[i]);
            }
         }
      }
   }
}

function is_then(node){
   var then = {
      'type': 'Identifier',
      'name': 'then',
   }
   var progress = {
      'type': 'Identifier',
      'name': 'progress',
   }
   var spread = {
      'type': 'Identifier',
      'name': 'spread'
   }
   return (variables_equal(then, node) || variables_equal(progress, node) || variables_equal(spread, node));
}

function is_catch(node){
   var catch_var = {
      'type': 'Identifier',
      'name': 'catch',
   };
   var fail = {
      'type': 'Identifier',
      'name': 'fail',
   }

   return (variables_equal(catch_var, node) || variables_equal(fail, node));
}

function is_finally(node){
   var finally_var = {
      'type': 'Identifier',
      'name': 'finally',
   };
   var fin = {
      'type': 'Identifier',
      'name': 'fin',
   };

   return (variables_equal(finally_var, node) || variables_equal(fin, node));
}

function is_done(node){
   var done = {
      'type': 'Identifier',
      'name': 'done'
   };
   return (variables_equal(done, node));
}

function parse_method(method, thens, catches, finallys, done){
   if (is_then(method.property)){
      thens.push(method);
   } else if (is_catch(method.property)){
      catches.push(method);
   } else if (is_finally(method.property)){
      finallys.push(method);
   } else if (is_done(method.property)){
      done = method;
   } else{
      // function does not return a promise
   }
}

function parse_promise_methods(promise){
   var thens = [];
   var catches = [];
   var finallys = [];
   var done;

   function parse(method) {
      return parse_method(method, thens, catches, finallys, done);
   }

   var all_funcs = get_all_functions(promise.expression);
   for (var i = 1; i < all_funcs.length; i++) {
      // start at 2nd element because the first is the original function call
      parse(all_funcs[i])
   }

   for (var i = 0; i < thens.length; i++) {
      console.log(thens[i].arguments);
   }
}


var code = fs.readFileSync('./test/fixtures/promise_fun.js', 'utf-8');
var parsed = esprima.parse(code, {
   // 'range': true,
   // 'loc': true
});
var q_vars = get_qs(parsed);
var funcs = check_function_decs(parsed, q_vars);
var calls = check_function_calls(parsed, funcs);