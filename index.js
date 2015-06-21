var fs = require('fs');
var path = require('path');
var _s = require('underscore.string');
var _ = require('underscore');
var nunjucks = require('nunjucks');
var iconv = require('iconv-lite');
var hljs = require('highlight.js');

module.exports.default_encoding = "utf8";
module.exports.encodings_map = {
    '.cs' : 'binary',
    '.cpp' : 'binary',
    '.h' : 'binary',
};

module.exports.text_file_cache = {};

var create_default_context = function (context) {
    item_data = context.partial_data[context.item_index_str];
    if (context.arg_opts.href == '$key') {
        var item_filename = context.item_index_str + context.extension;
    } else {
        var item_filename = item_data[context.arg_opts.href] + context.extension;
    }
    
    context.sliced_name = context.template_slice_name + "\\" + item_filename;
    context.current_pathname = path.join(context.templates_directory, context.sliced_name);
    context.item_data = item_data;
    return context;
}


function NodeCodeGenSourceLoader(templates_directory, source_directory) {
    this.lookup = {
        templates: templates_directory,
        sources: _.isArray(source_directory) ? source_directory : [source_directory],
    }
}

NodeCodeGenSourceLoader.prototype.getSource = function (name) {
    console.assert(_s.startsWith(name, this.lookup.templates), "unexpected name: " + name);
    
    name = name.slice(this.lookup.templates.length + 1);
    
    for (var s_index in this.lookup.sources) {
        var new_name = path.join(this.lookup.sources[s_index], name);
        if (fs.existsSync(new_name)) {
            return {
                'src' : module.exports.read_text_file(new_name).data,
                'path' : new_name,
            };
        }
    }
    console.assert(false, "file not found:" + new_name);
}

module.exports.NodeCodeGenSourceLoader = NodeCodeGenSourceLoader;

var repeat_sequence_for_each = function (ctx) {
    
    var end_pos = ctx.sliced_name.lastIndexOf('\\');
    console.assert(end_pos > 0, "must have filename");
    var template_slice_name = ctx.sliced_name.slice(0, end_pos);
    
    var end_pos = ctx.existing_content.indexOf('%}');
    console.assert(end_pos > 0, "bad repeat-for-each sequence");
    
    var arg_opts = { sort: 'name' };
    var arg_tokens = ctx.existing_content.slice(0, end_pos).split(' ');
    var existing_template = _s.ltrim(ctx.existing_content.slice(end_pos + 2));
    for (var arg_index = 2; arg_index < arg_tokens.length; ++arg_index) {
        var arg_token = arg_tokens[arg_index].split('=');
        if (arg_token.length == 2) {
            arg_opts[arg_token[0]] = arg_token[1];
        }
    }
    
    var access_tokens = arg_opts.data.split('.');
    var partial_data = ctx.known_models;
    for (var at_index in access_tokens) {
        partial_data = partial_data[access_tokens[at_index]];
        if (_.isUndefined(partial_data)) {
            console.error(util.inspect(access_tokens));
            console.assert(false, "this datasource is not supported");;
        }
    }

    ctx.arg_opts = arg_opts;
    ctx.partial_data = partial_data;
    ctx.template_slice_name = template_slice_name;
    ctx.templates_directory = ctx.templates_directory;
    ctx.extension = '.' + (arg_opts.extension || 'html');
    
    var extension_func = ctx.determine_data_enrichment_method();
    if (extension_func === null)
        extension_func = create_default_context;
    
    for (var item_index_str in partial_data) {
        ctx.item_index_str = item_index_str;
        extension_func(ctx);
        module.exports.overwrite_if_newer(
            path.join(ctx.output_directory, ctx.sliced_name), 
            ctx.env.renderString(existing_template, ctx.item_data, ctx.current_pathname),
            undefined,
            ctx.result);
    }
}

module.exports.read_text_file = function (filename) {
    
    function get_extension(filename) {
        var k_pos = filename.lastIndexOf('.');
        if (k_pos >= 0) {
            return filename.slice(k_pos).toLowerCase();
        }
        return "";
    }
    
    var file_extension = get_extension(filename);
    
    var file_content = module.exports.text_file_cache[filename];
    if (!_.isUndefined(file_content))
        return file_content;
    
    var file_encoding = module.exports.encodings_map[file_extension] || module.exports.default_encoding;
    
    if (!fs.existsSync(filename))
        return {
            'data' : null,
            'encoding' : file_encoding
        };
    
    if (file_encoding == "utf8") {
        module.exports.text_file_cache[filename] = {
            'data' : fs.readFileSync(filename, "utf8"),
            'encoding' : file_encoding
        }
    } else {
        module.exports.text_file_cache[filename] = {
            'data' : iconv.decode(fs.readFileSync(filename), file_encoding),
            'encoding' : file_encoding
        }
    }
    
    return module.exports.text_file_cache[filename];
}

module.exports.overwrite_if_newer = function (target_name, new_data, encoding, context) {
    context = context || {};
    context.total_files_to_write += 1;

    encoding = encoding || 'utf8';
    
    function overwrite_always() {
        if (encoding != 'utf8') {
            new_data = iconv.encode(new_data, 'latin1');
        }
        try {
            
            fs.writeFileSync(target_name, new_data);
        } catch (err) {
            fs.mkdirsSync(path.dirname(target_name));
            fs.writeFileSync(target_name, new_data);
        }
        context.total_files_written += 1;
        console.log("- written %s (%d chars)", target_name, new_data.length);
    }
    
    var existing_data = module.exports.read_text_file(target_name);
    if (existing_data == null)
        return overwrite_always();
    
    if (!(new_data == existing_data.data)) {
        overwrite_always();
    }
    return true;
};

var process_pre_blocks = function (input) {
    
    var last_start_pos = 0;
    while (true) {
        var start_of_pre_tag = input.indexOf('<pre><code ', last_start_pos);
        if (start_of_pre_tag < 0)
            break;
        
        
        var end_of_pre_tag = input.indexOf('>', start_of_pre_tag + 10);
        if (end_of_pre_tag < 0)
            break;
        
        
        var starting_pre_tag = input.slice(start_of_pre_tag, end_of_pre_tag);
        try {
            var language = starting_pre_tag.split(" ")[1].split("=")[1].slice(1, -1);
        }
            catch (err) {
            console.error("ERROR: exception caught: %s", err);
            console.error("while parsing '%s'", starting_pre_tag);
            return input;
        }
        
        var language_map = {
            'c#' : 'cs',
            'c++' : 'cpp',
            'objective-c' : 'objc',
            'sql' : 'sql',
            'java' : 'java',
            'cmd' : 'bash',
            'javascript' : 'js',
            'python' : 'python'
        }
        
        if (!(language in language_map)) {
            console.error("ERROR: don't know language '%s'", language);
            throw language;
            return input;
        }
        
        var start_of_closing_code_tag = input.indexOf('</code></pre>', end_of_pre_tag + 1);
        if (start_of_closing_code_tag < 0) {
            console.error("ERROR: did not find closing code tag");
            return input;
        }
        
        var code_block = input.slice(end_of_pre_tag + 1, start_of_closing_code_tag);
        code_block = hljs.highlight(language_map[language], code_block).value;
        
        input = input.slice(0, start_of_pre_tag) + '<pre>' + code_block + '</pre>' + input.slice(start_of_closing_code_tag + 13);
        
        last_start_pos = end_of_pre_tag;
    }
    return input;
}



var walkSync = function (currentDirPath, callback) {
    fs.readdirSync(currentDirPath).forEach(function (name) {
        var filePath = path.join(currentDirPath, name);
        var stat = fs.statSync(filePath);
        if (stat.isFile()) {
            callback(filePath, stat);
        } else if (stat.isDirectory()) {
            walkSync(filePath, callback);
        }
    });
};


module.exports.renderAll = function (context) {
    
    var header_len = context.templates_directory.length + 1;
    context.result = {
        total_files_to_write: 0,
        total_files_written: 0,
    };

    walkSync(context.templates_directory, function (pathname, stat) {
        var existing_text_file = module.exports.read_text_file(pathname);
        context.sliced_name = pathname.slice(header_len);
        context.existing_content = existing_text_file.data;
        context.current_pathname = pathname;
        context.encoding = existing_text_file.encoding;
        
        
        try {
            if (_s.startsWith(context.existing_content, "{% repeat_for_each")) {
                return repeat_sequence_for_each(context);
            }
            context.pre_process_item();
            context.existing_content = context.env.renderString(context.existing_content, context.known_models, pathname);
                
        } catch (err) {
            console.error(err);
            console.error("WHILE PARSING '%s'", pathname);
            throw err;
        }
        return module.exports.overwrite_if_newer(
            path.join(context.output_directory, context.sliced_name), 
            context.existing_content, 
            context.encoding,
            context.result);
    });
    return context.result;
}


module.exports.get_sort_by_int_key = function (key) {
    return function (a, b) {
        a = parseInt(a[key]);
        b = parseInt(b[key]);
        if (a < b)
            return -1;
        if (a > b)
            return 1;
        return 0;
    };
}

module.exports.get_sort_by_int_str = function (key) {
    return function (a, b) {
        a = a[key];
        b = b[key];
        if (a < b)
            return -1;
        if (a > b)
            return 1;
        return 0;
    };
}



var Environment = function Environment(arg) {
    nunjucks.Environment.call(this, arg);

    this.addFilter('ljust', function (str, count) {
        var m = count - str.length;
        var result = str;
        while (result.length < count) {
            result += ' ';
        }
        return result;
    });

    this.addFilter('rjust', function(str, count) {
        var m = count - str.length;
        var result = str;
        while (result.length < count) {
            result = ' ' + result;
        }
        return result;
    });
    
    this.addGlobal('split_lines', function (lines) {
        return _.map(lines.split('\n'), function (line) {
            return _s.rstrip(line);
        });
    });

    this.addGlobal('blanks', function (expected_len) {
        var s = "";
        for (var i = 1; i < arguments.length; i++) {
            s += arguments[i];
        }
        
        if (s.length < expected_len) {
            var blanks_required = expected_len - s.length;
            var result = "";
            while (result.length < blanks_required)
                result += " ";
            return result;
        }
        
        return "";
    });
    this.addFilter('relpath', function (str, offset) {
        console.assert(!_.isUndefined(str), "passed invalid argument to relpath()");
        return path.join(str, offset);
    });

    this.addFilter('strip_ps', function(str) {
        if (_s.startsWith(str, '<p>')) {
            str = str.slice(3);
        }
        if (_s.endsWith(str, '</p>')) {
            str = str.slice(0, str.length - 4);
        }
        return str;
    });

    this.addFilter('list_sort', function (list, key, cast_as) {
        if (cast_as == 'int') {
            list.sort(module.exports.get_sort_by_int_key(key));
        }
        else {
            list.sort(module.exports.get_sort_by_int_str(key));
        }
        return list;
    });
};

Environment.prototype = Object.create(nunjucks.Environment.prototype);
Environment.prototype.constructor = Environment;
Environment.prototype.renderOriginal = nunjucks.Environment.prototype.render;
Environment.prototype.renderStringOriginal = nunjucks.Environment.prototype.renderString;
Environment.prototype.renderString = function (input, data, pathname, source_loaders) {
    var lines = _s.lines(input);
    var stitches = [];
    var requires_trailing_slash_r = true;
    var s = null;
    var line = null;
    var input_seq = null;
    
    var pm_default = function () {
        if (_s.strip(line) == "{% stitch %}") {
            s = {
                'begin' : null,
                'end' : null,
                'lines' : []
            };
            stitches.push(s);
            current_parser_method = pm_record_begin;
        }
    };
    
    var pm_record_begin = function () {
        s.begin = line;
        current_parser_method = pm_record_lines;
    };
    
    var pm_record_lines = function () {
        if (_s.strip(line) == "{% endstitch %}") {
            s.end = s.lines[s.lines.length - 1];
            delete s.lines[s.lines.length - 1];
            current_parser_method = pm_default;
        }
        else {
            s.lines.push(line);
        }
    };
    
    var current_parser_method = pm_default;
    
    for (var line_index in lines) {
        var line = lines[line_index];
        current_parser_method();
    }
    
    if (stitches.length === 0) {
        return process_pre_blocks(this.renderStringOriginal(input, data));
    }
    
    // now locate the original source
    input_seq = null;
    if (_.isArray(source_loaders)) {
        for (var loader_index in source_loaders) {
            loader = source_loaders[loader_index];
            input_seq = loader.getSource(pathname);
            if (input_seq != null)
                break;
        }
    } else if (_.isFunction(source_loaders)) {
        input_seq = source_loaders(pathname);
    }
    if (input_seq == null) {
        for (var loader_index in this.opts.stitch_source_loaders) {
            loader = this.opts.stitch_source_loaders[loader_index];
            input_seq = loader.getSource(pathname);
            if (input_seq != null)
                break;
        }
    }
    console.assert(input_seq != null, "did not find stitching-source " + pathname);
    input = input_seq.src;
    
    for (var s_index in stitches) {
        var stitch = stitches[s_index];
        var newline = requires_trailing_slash_r ? "\r\n" : "\n";
        
        stitch['text'] = this.renderStringOriginal(stitch['lines'].join(newline), data);
        var last_start_pos = -1;
        while (true) {
            
            var start_pos = (last_start_pos < 0) ? input.indexOf(stitch.begin) : input.indexOf(stitch.begin, last_start_pos);
            if (start_pos < 0) {
                if (last_start_pos >= 0)
                    break;
                console.warn("Warning: %s does not contain start of stitch, ignoring", input_seq.path);
                break;
            }
            else {
                var end_pos = input.indexOf(stitch.end, start_pos);
                if (end_pos < 0) {
                    console.warn("Warning: %s does not contain end of stitch, ignoring", input_seq.path);
                    break;
                }
                else {
                    input = input.slice(0, start_pos) + stitch.begin + newline + stitch['text'] + input.slice(end_pos);
                    last_start_pos = end_pos + stitch.end.length;
                }
            }
        }
    }
    return process_pre_blocks(input);
}

Environment.prototype.render = function (pathname, data, source_loaders) {
    var p = this,
        loader = null,
        result = null;
    for (var loader_index in this.loaders) {
        loader = this.loaders[loader_index];
        result = loader.getSource(pathname);
        if (result != null)
            break;
    }
    if (result == null) {
        return this.renderOriginal(pathname, data);
    }
    
    var input = result.src;
    var lines = _s.lines(input);
    var stitches = [];
    var requires_trailing_slash_r = true;
    var s = null;
    var line = null;
    var input_seq = null;
    
    var pm_default = function () {
        if (_s.strip(line) == "{% stitch %}") {
            s = {
                'begin' : null,
                'end' : null,
                'lines' : []
            };
            stitches.push(s);
            current_parser_method = pm_record_begin;
        }
    };
    
    var pm_record_begin = function () {
        s.begin = line;
        current_parser_method = pm_record_lines;
    };
    
    var pm_record_lines = function () {
        if (_s.strip(line) == "{% endstitch %}") {
            s.end = s.lines[s.lines.length - 1];
            delete s.lines[s.lines.length - 1];
            current_parser_method = pm_default;
        }
        else {
            s.lines.push(line);
        }
    };
    
    var current_parser_method = pm_default;
    
    for (var line_index in lines) {
        var line = lines[line_index];
        current_parser_method();
    }
    
    if (stitches.length === 0) {
        return this.renderOriginal(pathname, data);
    }
    
    // now locate the original source
    input_seq = null;
    if (_.isArray(source_loaders)) {
        for (var loader_index in source_loaders) {
            loader = source_loaders[loader_index];
            input_seq = loader.getSource(pathname);
            if (input_seq != null)
                break;
        }
    } else if (_.isFunction(source_loaders)) {
        input_seq = source_loaders(pathname);
    }
    if (input_seq == null) {
        for (var loader_index in this.opts.stitch_source_loaders) {
            loader = this.opts.stitch_source_loaders[loader_index];
            input_seq = loader.getSource(pathname);
            if (input_seq != null)
                break;
        }
    }
    console.assert(input_seq != null, "did not find stitching-source " + pathname);
    input = input_seq.src;
    
    for (var s_index in stitches) {
        var stitch = stitches[s_index];
        var newline = requires_trailing_slash_r ? "\r\n" : "\n";
        
        stitch['text'] = this.renderStringOriginal(stitch['lines'].join(newline), data);
        var last_start_pos = -1;
        while (true) {
            
            var start_pos = (last_start_pos < 0) ? input.indexOf(stitch.begin) : input.indexOf(stitch.begin, last_start_pos);
            if (start_pos < 0) {
                if (last_start_pos >= 0)
                    break;
                console.warn("Warning: %s does not contain start of stitch, ignoring", input_seq.path);
                break;
            }
            else {
                var end_pos = input.indexOf(stitch.end, start_pos);
                if (end_pos < 0) {
                    console.warn("Warning: %s does not contain end of stitch, ignoring", input_seq.path);
                    break;
                }
                else {
                    input = input.slice(0, start_pos) + stitch.begin + newline + stitch['text'] + input.slice(end_pos);
                    last_start_pos = end_pos + stitch.end.length;
                }
            }
        }
    }
    return input;
}

module.exports.Template = nunjucks.Template;
module.exports.Loader = nunjucks.Loader;
module.exports.FileSystemLoader = nunjucks.FileSystemLoader;
module.exports.WebLoader = nunjucks.WebLoader;
module.exports.compiler = nunjucks.compiler;
module.exports.parser = nunjucks.parser;
module.exports.lexer = nunjucks.lexer;
module.exports.runtime = nunjucks.runtime;
module.exports.configure = nunjucks.configure;
module.exports.compile = nunjucks.compile;
module.exports.render = nunjucks.render;
module.exports.precompile = nunjucks.precompile;
module.exports.precompileString = nunjucks.precompileString;
module.exports.Environment = Environment;
