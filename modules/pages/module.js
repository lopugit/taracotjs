module.exports = function(app) {
    var router = app.get('express').Router(),
        path = require('path'),
        gaikan = require('gaikan'),
        i18nm = new(require('i18n-2'))({
            locales: app.get('config').locales.avail,
            directory: path.join(__dirname, 'lang'),
            extension: '.js',
            devMode: app.get('config').locales.dev_mode
        }),
        Entities = require('html-entities').AllHtmlEntities;
    entities = new Entities();
    router.get(/(.*)/, function(req, res, next) {
        var lng = req.session.current_locale;
        i18nm.setLocale(lng);
        var param = req.params[0],
            url_parts = param.split('/');
        url_parts.forEach(function(fn) {
            if (fn.match(/ /) || fn.match(/^[\^<>\/\:\"\\\|\?\*\x00-\x1f]+$/)) return res.status(404); // whitespace
        });
        var fd1 = url_parts.join('/'),
            fn1 = '',
            fd2 = param.split('/').slice(0, -1).join('/') || '/',
            fn2 = url_parts[url_parts.length - 1],
            find_query = {
                $or: [{
                    pfolder: fd1,
                    pfilename: fn1
                }, {
                    pfolder: fd2,
                    pfilename: fn2
                }]
            };
        app.get('mongodb').collection('pages_folders').find({
            oname: 'folders_json'
        }, {
            limit: 1
        }).toArray(function(err, items) {
            var folders;
            if (!items || !items.length || !items[0].ovalue) {
                folders = [{
                    "id": "j1_1",
                    "text": "/",
                    "data": null,
                    "parent": "#",
                    "type": "root"
                }];
            } else {
                folders = JSON.parse(items[0].ovalue);
            }
            app.get('mongodb').collection('pages').find(find_query, {
                limit: 1
            }).toArray(function(err, items) {
                if (!err && typeof items != 'undefined' && items && items.length && !err) {
                    if (!items[0].pdata) items[0].pdata = {};
                    if (!items[0].pdata[lng]) items[0].pdata[lng] = {};
                    var pfolder_id = items[0].pfolder_id || 'j1_1',
                        bread = folders_find_path(folders_make_hash(folders), pfolder_id).reverse(),
                        bread_html = '<li><a href="/">' + app.get('settings').site_title + '</a></li>',
                        bread_path = '',
                        title_arr = [];
                    for (var i = 0; i < bread.length; i++) {
                        bread_path += '/' + bread[i].name;
                        var ln = bread[i][req.session.current_locale] || bread[i].name;
                        bread_html += '<li><a href="' + bread_path + '">' + ln + '</a></li>';
                        title_arr.push(ln);
                    }
                    title_arr = title_arr.reverse();
                    bread_html += '<li>' + items[0].pdata[lng].ptitle + '</li>';
                    bread_html_uikit = '<ul class="uk-breadcrumb">' + bread_html + '</ul>';
                    bread_html_bootstrap = '<ol class="breadcrumb">' + bread_html + '</ol>';
                    var page_data = {
                        title: items[0].pdata[lng].ptitle,
                        keywords: items[0].pdata[lng].keywords,
                        description: items[0].pdata[lng].desc,
                        bread: bread,
                        bread_html: bread_html,
                        bread_html_uikit: bread_html_uikit,
                        bread_html_bootstrap: bread_html_bootstrap,
                        current_lang: lng
                    };
                    var html_render = '';
                    page_data.blocks_sync = {};
                    try {
                        Object.keys(app.get('blocks_sync')).forEach(function(key) {
                            var fn = app.get('blocks_sync')[key];
                            if (fn) page_data.blocks_sync[key] = fn;
                        });
                        var renderer = gaikan.compileFromString(entities.decode(items[0].pdata[lng].pcontent));
                        html_render = renderer(gaikan, page_data, undefined);
                    } catch (ex) {}
                    var full_title = items[0].pdata[lng].ptitle;
                    if (title_arr.length) {
                        full_title += ' | ' + title_arr.join(' | ');
                    }
                    var data = {
                        title: full_title,
                        current_lang: lng,
                        page_title: items[0].pdata[lng].ptitle,
                        content: html_render,
                        keywords: items[0].pdata[lng].pkeywords,
                        description: items[0].pdata[lng].pdesc,
                        bread: bread,
                        bread_html: bread_html,
                        bread_html_uikit: bread_html_uikit,
                        bread_html_bootstrap: bread_html_bootstrap
                    };
                    var layout = items[0].pdata[lng].playout || undefined;
                    return app.get('renderer').render(res, layout, data, req);
                } else {
                    return next();
                }
            });
        });
    });

    var folders_make_hash = function(fldrs) {
        var fh = {};
        for (var i = 0; i < fldrs.length; i++) {
            fh[fldrs[i].id] = fldrs[i];
            delete fh[fldrs[i].id].id;
        }
        return fh;
    };

    var folders_find_path = function(fldrs_hash, id, _path) {
        var path = _path || [];
        if (fldrs_hash && id && fldrs_hash[id] && fldrs_hash[id].parent && fldrs_hash[id].parent != '#') {
            var pi = {
                name: fldrs_hash[id].text
            };
            var locales = app.get('config').locales.avail;
            if (fldrs_hash[id].data && fldrs_hash[id].data.lang) {
                for (var i = 0; i < locales.length; i++) {
                    pi[locales[i]] = fldrs_hash[id].data.lang[locales[i]];
                }
            }
            path.push(pi);
            folders_find_path(fldrs_hash, fldrs_hash[id].parent, path);
        }
        return path;
    };

    return router;
};
