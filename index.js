var fs = require('fs');
var _s = require('underscore.string');
var _ = require('underscore');
var nunjucks = require('nunjucks');

module.exports.ljust = function (str, count) {
        var m = count - str.length;
        var result = str;
        while (result.length < count) {
            result += ' ';
        }
        return result;
    };

module.exports.rjust = function (str, count) {
    var m = count - str.length;
    var result = str;
    while (result.length < count) {
        result = ' ' + result;
    }
    return result;
};

var Environment = function Environment(arg) {
    nunjucks.Environment.call(this, arg);
    this.addFilter('ljust', module.exports.ljust);
    this.addFilter('rjust', module.exports.rjust);
};

Environment.prototype = Object.create(nunjucks.Environment.prototype);
Environment.prototype.constructor = Environment;
Environment.prototype.renderWithStitching = function (pathname, data, source_loaders) {
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
        return this.render(pathname, data);
    }
    
    var input = result.src;
    var lines = _s.lines(input);
    var stitches = [];
    var requires_trailing_slash_r = true;
    var s = null;
    var line = null;
    
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
        return this.render(pathname, data);
    }
    
    // now locate the original source
    input = null;
    if (_.isArray(source_loaders)) {
        for (var loader_index in source_loaders) {
            loader = source_loaders[loader_index];
            input = loader.getSource(pathname);
            if (input != null)
                break;
        }
    } else if (_.isFunction(source_loaders)) {
        input = source_loaders(pathname);
    }
    if (input == null) {
        for (var loader_index in this.opts.stitch_source_loaders) {
            loader = this.opts.stitch_source_loaders[loader_index];
            input = loader.getSource(pathname);
            if (input != null)
                break;
        }
    }
    if (input == null) {
        console.assert(input != null, "did not find stitching-source " + pathname);
    }
    input = input.src;
    
    for (var s_index in stitches) {
        var stitch = stitches[s_index];
        var newline = requires_trailing_slash_r ? "\r\n" : "\n";
        
        stitch['text'] = this.renderString(stitch['lines'].join(newline), data);
        var last_start_pos = -1;
        while (true) {
            
            var start_pos = (last_start_pos < 0) ? input.indexOf(stitch.begin) : input.indexOf(stitch.begin, last_start_pos);
            if (start_pos < 0) {
                if (last_start_pos >= 0)
                    break;
                console.warn("Warning: %s does not contain start of stitch, ignoring", original_source);
                break;
            }
            else {
                var end_pos = input.indexOf(stitch.end, start_pos);
                if (end_pos < 0) {
                    console.warn("Warning: %s does not contain end of stitch, ignoring", original_source);
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
module.exports.renderString = nunjucks.renderString;
module.exports.precompile = nunjucks.precompile;
module.exports.precompileString = nunjucks.precompileString;
module.exports.Environment = Environment;
