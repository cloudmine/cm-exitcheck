unit:
	./node_modules/mocha/bin/_mocha

cov:
	./node_modules/mocha/bin/_mocha --require ./node_modules/blanket-node/bin/index.js -R html-cov > coverage.html 
	open coverage.html

travis-cov:
	./node_modules/mocha/bin/_mocha --require ./node_modules/blanket-node/bin/index.js -R travis-cov