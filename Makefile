unit:
	./node_modules/mocha/bin/_mocha

lint:
	./node_modules/jshint/bin/jshint lib/

test: unit lint

cov:
	./node_modules/mocha/bin/_mocha --require ./node_modules/blanket-node/bin/index.js -R html-cov > coverage.html 
	open coverage.html

travis-cov:
	./node_modules/mocha/bin/_mocha --require ./node_modules/blanket-node/bin/index.js -R travis-cov
