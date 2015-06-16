# nunjucks-grime
Some [nunjucks](https://mozilla.github.io/nunjucks/) extensions for code generators

- allows stitching of existing files
- ljust/rjust support

Granted, that sounds kind of underwhelming. So what is it?

## Stitching sources

The way you normally use **nunjucks** is this:

	template ---> generated output 

This incredible piece of ASCII art means that the default mode of operation is that the *template* must be a complete description of the output file, where generated content is added in.

But sometimes you are in a situation where you need this:

	(existing file + something generated) --> generated output

For example, in my code base I have existing C/C++ code that includes stuff dynamically generated and stuff manually maintained. So I need a solution that

- allows me to maintain in control of the source code
- decorate just some lines in it using code generation

This is not a solution [nunjucks](https://mozilla.github.io/nunjucks/) supports out of the box, so I added a small syntax extension. The elements of the solution are these:

- the template syntax is extended to defined a 'piece to be stitched into an existing file'. 
- nunjucks Environments already have a set of loaders used to find. So now we have an additional set of loaders that can be used to load 'stitch sources'
- Bass! Magic!

### Stitching Example

Ok, let's assume you have this file `stitched.h`:

#### The text you want to modify 

	#ifndef STITCH_SOURCE_H
	#define STITCH_SOURCE_H
	
	... tons of code here that is NOT generated ...
	
	// BEGIN GENERATED FUNCTIONS: DO NOT MANUALLY EDIT, THIS IS GENERATED CODE
	// BUT how do I get my generated stuff in here while retaining all the existing bits? 
	// END GENERATED FUNCTIONS: DO NOT MANUALLY EDIT, THIS IS GENERATED CODE
	
	... huge megatons of code here that is NOT generated either ...
	
	#endif // STITCH_SOURCE_H

Fear no more, **nunjucks-grime** is here. You define a special stitch template like this:

#### The stitch-template dialect

	{% stitch %}
	// BEGIN GENERATED FUNCTIONS: DO NOT MANUALLY EDIT, THIS IS GENERATED CODE
	
	{%- for item in well_known_client_functions %}
	typedef HRESULT (*WINAPI LPFN{{ item }})(LPCTSTR Bassdrum);
	{%- endfor %}        
	
	// END GENERATED FUNCTIONS: DO NOT MANUALLY EDIT, THIS IS GENERATED CODE
	{% endstitch %}

Some points to notice:

- The actual code syntax is 100% nunjucks.
- There are only two exceptions:
	0. `{% stitch %}` indicates that this is the start of a stitch block. The *next* line will indicate how to recognize the start of that block in the input.
	1. `{% endstitch %}` tells the code that the *previous* line terminates the block in the input.  

#### The actual code

If you are familiar with nunjucks (or jinja2 for that matter), this should be pretty readable. Next up: putting it all together

	var nunjucks = require('nunjucks-grime');

	var env = new nunjucks.Environment(new nunjucks.FileSystemLoader('views'));
    env.opts["stitch_source_loaders"] = [new nunjucks.FileSystemLoader('stitch_sources')];
    console.log(env.render('stitched.h', data));
    
This will modify your *existing source* like this:

	#ifndef STITCH_SOURCE_H
	#define STITCH_SOURCE_H
	
	... tons of code here that is NOT generated ...
	
	// BEGIN GENERATED FUNCTIONS: DO NOT MANUALLY EDIT, THIS IS GENERATED CODE
	
	typedef HRESULT (*WINAPI LPFNfoo)(LPCTSTR Bassdrum);
	typedef HRESULT (*WINAPI LPFNbar)(LPCTSTR Bassdrum);
	typedef HRESULT (*WINAPI LPFNblubber)(LPCTSTR Bassdrum);
	
	// END GENERATED FUNCTIONS: DO NOT MANUALLY EDIT, THIS IS GENERATED CODE
	
	... huge megatons of code here that is NOT generated either ...
	
	#endif // STITCH_SOURCE_H

That means you can run that repeatedly, as long as you want: *nunjucks-grime* will only ever touch the bits enclosed in `BEGIN GENERATED FUNCTIONS..` and `END GENERATED FUNCTIONS`. Not so bad, eh?

OK, now that you are convinced, let's slowly review the code lines I used: 

	var nunjucks = require('nunjucks-grime');

Note that *nunjucks-grime* is designed t be used as a drop-in replacement for the original *nunjucks*.

	var env = new nunjucks.Environment(new nunjucks.FileSystemLoader('views'));

That was standard. 

    env.opts["stitch_source_loaders"] = [new nunjucks.FileSystemLoader('stitch_sources')];

Now this is an extension: you must define how *nunjucks-grime* should find the original sources to be stitched. You can use any of the existing *nunjucks* loaders, or write your own standard-conforming loader.

    console.log(env.render('stitched.h', data));
    
*Look ma, no new parameters*

## Minor stuff

Also, because I needed it I have added two helper filters that [jinja2](http://jinja.pocoo.org/docs/dev/) has supported for quite some time: 

- `ljust` for left-aligning text
- `rjust` for right-aligning text

This was probably just an oversight of the *nunjucks* port: because on the web you don't normally need that kind of thing. 

### Example

Let's say you have this input:

	#ifndef NUNJUCKS_EXTRAS_H
	#define NUNJUCKS_EXTRAS_H
	
	// By default, the list will not be aligned:
	{%- for item in list_of_items %}
	#define {{ item.name }} {{ item.value }}
	{%- endfor %}
	
	// but now you can left-align
	{%- for item in list_of_items %}
	#define {{ item.name|ljust(20) }} {{ item.value }}
	{%- endfor %}
	
	// and right-align
	{%- for item in list_of_items %}
	#define {{ item.name|rjust(20) }} {{ item.value }}
	{%- endfor %}
	
	#endif // NUNJUCKS_EXTRAS_H

Note the use of `ljust` and `rjust` to specify an alignment. The actual result with *nunjucks-grime* this:	

	#ifndef NUNJUCKS_EXTRAS_H
	#define NUNJUCKS_EXTRAS_H
	
	// By default, the list will not be aligned:
	#define foo 0x10
	#define bar 0x1000
	#define blubber 0xFFFFFFFE
	
	// but now you can left-align
	#define foo                  0x10
	#define bar                  0x1000
	#define blubber              0xFFFFFFFE
	
	// and right-align
	#define                  foo 0x10
	#define                  bar 0x1000
	#define              blubber 0xFFFFFFFE
	
	#endif // NUNJUCKS_EXTRAS_H

## What is up with the name?

I've been hooked on listening to [this](http://www.bbc.co.uk/programmes/b007z0q1) on volumes that shouldn't be legal.






   