/*!
 * jQuery plugin xupload v1.0
 *
 * Copyright 2011, Jean-Baptiste Demonte
 * Dual licensed under the MIT or GPL Version 2 licenses.
 * Released under the MIT, BSD, and GPL Licenses.
 */
(function ($, undef) {

    var namespace = "xupload",

        isXhr = window.XMLHttpRequest && (new XMLHttpRequest()).hasOwnProperty("upload"),
        events = {
            submit: "submit." + namespace,
            end: "end." + namespace,

            errorExt: "extension-error." + namespace,
            errorSize: "size-error." + namespace,

            uploadStart: "upload-start." + namespace,
            uploadProgress: "upload-progress." + namespace,
            uploadComplete: "upload-complete." + namespace,
            uploadCancel: "upload-cancel." + namespace,

            documentDragEnter: "document-drag-enter." + namespace,
            documentDragLeave: "document-drag-leave." + namespace,

            dragOver: "drag-over." + namespace,
            dragEnter: "drag-enter." + namespace,
            dragLeave: "drag-leave." + namespace,

            drop: "drop." + namespace
        },
        uniqueId = 0;

    /**
    * INIT DOM
    ***************************************************************************/

    if (isXhr) {
        $(document).bind("dragover", function (event) {
            var e = event.originalEvent;
            if (e.dataTransfer) {
                e.dataTransfer.dropEffect = "none";
                e.stopPropagation();
                e.preventDefault();
            }
        });
    }

  /**
   * INTERNAL FUNCTIONS
   ***************************************************************************/

    function sizetoByte(hsize) {
        var result, size, unit, exp;
        if (typeof hsize === "number") {
            result = hsize;
        } else if (typeof hsize === "string") {
            size = hsize.match(/[0-9\.,]+/g);
            unit = hsize.match(/[a-z]+/ig);

            if (size && size.length) {
                size = parseFloat(size[0].replace(",", "."));
                if (unit && unit.length) {
                    unit = unit[0].substr(0, 1).toLowerCase();
                    exp = "bkmgtpe".indexOf(unit);
                    if (exp !== -1) {
                        size = size * Math.pow(1024, exp);
                    }
                }
                result = size;
            }
        }
        return result;
    }

    function formatSize(bytes, precision) {
        var i = 0;
        while (bytes > 99) {
            bytes = bytes / 1024;
            i += 1;
        }
        return Math.max(bytes, 0.1).toFixed(precision !== undef ? precision : 1) + " kMGTPE".substr(i, 1);
    }

    function setProperties(e, prop) {
        var k;
        function set(e, p, v) {
            if ($.browser.msie && (p === "name")) {
                e.name = v;
            } else if (e.setAttribute) {
                e.setAttribute(p, v);
            } else {
                e.setProperty(p, v, null);
            }
        }
        for (k in prop) {
            if (prop.hasOwnProperty(k) && prop[k] !== undef) {
                if (typeof prop[k] === "object" && e[k] !== undef) {
                    setProperties(e[k], prop[k]);
                } else {
                    set(e, k, prop[k]);
                }
            }
        }
    }

    // Michael McGrady method to create hidden input
    function mcGrady($this, $input) {
        var i = $input.get(0),
            prop = {
                style: {
                    position: "absolute",
                    right: 0,
                    top: 0,
                    margin: 0,
                    padding: 0,
                    cursor: $this.css("cursor"),
                    "z-index": 1000
                }
            };

        $this.css("position", "relative").css("overflow", "hidden");

        if ($.browser.opera) {
            prop.style["-o-transform"] = "translate(-6000px, 0px) scale(100)";
        } else if ($.browser.mozilla) {
            prop.style["-moz-transform"] = "translate(-5000px, 0px) scale(100)";
        } else {
            prop.style.border = "500px solid transparent";
        }
        if ($.support.opacity) {
            prop.style.opacity = 0;
        } else {
            prop.style.filter = 'alpha(opacity=0)';
        }
        setProperties(i, prop);
    }

    function dom(html) {
        var e, div = document.createElement('div');
        div.innerHTML = html;
        e = div.firstChild;
        div.removeChild(e);
        return e;
    }

    function attachEvent(e, type, fn) {
        if (e.addEventListener) {
            e.addEventListener(type, fn, false);
        } else if (e.attachEvent) {
            e.attachEvent('on' + type, fn);
        } else {
            e.attachEvent('on' + type, fn);
        }
    }

    function isExtAllowed(filename, allowed) {
        if (!allowed.length) {
            return true;
        }
        var i,
            ext = filename.indexOf('.') !== -1 ? filename.replace(/.*[.]/, '').toLowerCase() : '';
        for (i = 0; i < allowed.length; i += 1) {
            if (allowed[i] === ext) {
                return true;
            }
        }
        return false;
    }

    function toUrl(url, params) {
        var k;
        url += (/\?/.test(url)) ? (/\?$/.test(url)) ? '' : '&' : '?';
        for (k in params) {
            if (params.hasOwnProperty(k)) {
                url += k + '=' + encodeURIComponent(params[k]) + '&';
            }
        }
        return url.replace(/&$/, '');
    }

    function toCamel(s) {
        return s.replace(/^[^a-z0-9]+/gi, "").replace(/([^a-z0-9]+[a-z0-9])/gi, function (e) {return e.toUpperCase().replace(/[^a-z0-9]/gi, ""); });
    }

    function ucfirst(s) {
        return s.charAt(0).toUpperCase() + s.substr(1);
    }

    function createXhrObject() {
        var result;
        if (window.ActiveXObject) {
            if (window.XMLHttpRequest) {
                result = new XMLHttpRequest();
            } else {
                $.each(["Msxml2.XMLHTTP.6.0", "Msxml2.XMLHTTP.3.0", "Msxml2.XMLHTTP", "Microsoft.XMLHTTP"], function (i, name) {
                    try {
                        result = result || new ActiveXObject(name);
                    } catch (e) {
                    }
                });
                if (!result) {
                    window.alert("Your browser doesn't support XMLHTTPRequest object.");
                }
            }
        }
        return result;
    }

    function getFileProperties(file) {
        // safari 4 : filename is missing
        return {
            name: file.fileName !== undef ? file.fileName : file.name,
            size: file.fileSize !== undef ? file.fileSize : file.size
        };
    }

  /**
   * CLASS XhrUploader
   ***************************************************************************/
    function XhrUploader(config, trig, files) {
        var requests = [],
            running = 0;

        function main() {
            var i,
                err = {
                    ext: [],
                    size: []
                },
                file;

            for (i = 0; i < files.length; i += 1) {
                file = getFileProperties(files[i]);
                if (!isExtAllowed(file.name, config.ext)) {
                    err.ext.push({filename: file.name, filesize: file.size, prettysize: formatSize(file.size)});
                } else if (config.size !== undef && file.size > config.size) {
                    err.size.push({filename: file.name, filesize: file.size, prettysize: formatSize(file.size)});
                }
            }
            if (!err.ext.length && !err.size.length) {
                running = files.length;
                for (i = 0; i < files.length; i += 1) {
                    file = getFileProperties(files[i]);
                    config.params[config.name] = file.name;
                    upload(toUrl(config.action, config.params), config.credential, files[i], file.name, file.size);
                }
            } else {
                if (err.ext.length) {
                    trig(events.errorExt, {files: err.ext, ext: config.ext});
                } else if (err.size.length) {
                    trig(events.errorSize, {files: err.size, size: config.size, prettysize: formatSize(config.size)});
                }
                end();
            }
        }

        function upload(url, credential, file, filename, filesize) {
            var xhr = createXhrObject(),
                idx = requests.length,
                prettysize = formatSize(filesize);

            if (!xhr) {
                return;
            }

            requests[idx] = {xhr: xhr, filename: filename, filesize: filesize, prettysize: prettysize};

            xhr.upload.onprogress  = function (e) {
                if (e.lengthComputable && e.total) {
                    trig(events.uploadProgress, {idx: idx, filename: filename, filesize: filesize, prettysize: prettysize, loaded: e.loaded, total: e.total});
                }
            };

            xhr.onreadystatechange = function () {
                if (!requests[idx]) { // cancelled
                    return;
                }
                if (this.readyState === 4) {
                    var result = {};
                    if (this.status === 200) {
                        try {
                            result = eval("(" + xhr.responseText + ")");
                        } catch (err) {
                            result = {};
                        }
                        trig(events.uploadComplete, {idx: idx, filename: filename, filesize: filesize, prettysize: prettysize, result: result, status: this.status});
                    }
                    end(idx);
                }
            };

            // start upload
            xhr.open("POST", url, true);
            if (credential) {
                xhr.withCredentials = true;
            } else {
                xhr.setRequestHeader("X-Requested-With", "XMLHttpRequest");
            }
            xhr.setRequestHeader("X-File-Name", encodeURIComponent(config.name));
            xhr.setRequestHeader("Content-Type", "application/octet-stream");
            if (config.csrf) {
                xhr.setRequestHeader(config.csrf.xname, config.csrf.token);
            }

            trig(events.uploadStart, {idx: idx, filename: filename, filesize: filesize, prettysize: prettysize, progress: true});

            xhr.send(file);
        }

        function end(idx) {
            if (idx === undef) {
                trig(events.end);
            } else if (requests[idx]) {
                delete requests[idx];
                running -= 1;
                if (!running) {
                    trig(events.end);
                }
            }
        }

        this.cancel = function (idx) {
            var i,
                r,
                idxs = [];
            if (idx === undef) {
                for (i = 0; i < requests.length; i += 1) {
                    idxs.push(i);
                }
            } else {
                idxs.push(idx);
            }
            for (i = 0; i < idxs.length; i += 1) {
                r = requests[idxs[i]];
                r.xhr.abort();
                trig(events.uploadCancel, {idx: idxs[i], name: r.name, filename: r.filename, filesize: r.filesize, prettysize: r.prettysize});
                delete requests[idxs[i]];
            }
        };

        trig(events.submit);
        main();
    }


    /**
    * CLASS FrmUploader
    ***************************************************************************/
    function FrmUploader(config, trig, fileInput) {
        var request;

        function main() {
            var filename = fileInput.value.replace(/.*(\/|\\)/, "");
            if (!isExtAllowed(filename, config.ext)) {
                trig(events.errorExt, {name: name, files: [{filename: filename}], ext: config.ext});
                end();
                return;
            }
            upload(name, toUrl(config.action, config.params), fileInput, filename);
        }

        function upload(name, url, input, filename) {
            uniqueId += 1;
            var ifrmId = namespace + "-ifrm-" + uniqueId,
                // IE: document.createElement("form") won't attach the file
                csrfHidden = config.csrf ? "<input type='hidden' name='" + config.csrf.name  + "' value='" + config.csrf.token + '" />' : '',
                form = dom("<form method='post' enctype='multipart/form-data'>" + csrfHidden + "</form>"),
                fattr = {
                    method : "post",
                    enctype: "multipart/form-data",
                    action : url,
                    target : ifrmId,
                    style  : {
                        display: "none"
                    }
                },
                // IE < 8 : update name bugs on iframe element else we should use document.createElement("iframe")
                ifrm = dom("<iframe src='javascript:false;' name='" + ifrmId + "' />"),
                iattr = {
                    src: "javascript:false",
                    id: ifrmId,
                    name: ifrmId,
                    style: {
                        display: "none"
                    }
                };

            request = {ifrm: ifrm, form: form, name: name, filename: filename};
            setProperties(form, fattr);
            setProperties(ifrm, iattr);
            if (input.parentNode) {
                input.parentNode.removeChild(input);
            }
            document.body.appendChild(ifrm);
            form.appendChild(input);
            document.body.appendChild(form);

            attachEvent(ifrm, "load", function () {
                if (!ifrm.parentNode) {
                    return;
                }
                var doc = ifrm.contentWindow.document || ifrm.contentDocument,
                    result;
                try {
                    // some browser add <pre> </pre>
                    result = eval("(" + doc.body.innerHTML.replace(/^\s*<pre>(.*)<\/pre>\s*$/i, "$1") + ")");
                } catch (err) {
                    result = {};
                }
                trig(events.uploadComplete, {idx: 0, name: name, filename: filename, result: result});
                end();
            });
            trig(events.uploadStart, {idx: 0, name: name, filename: filename, progress: false});
            form.submit();
        }

        function end() {
            if (request) {
                // remove child after 200ms, else, some browser still display a loading state
                setTimeout(
                    function () {
                        document.body.removeChild(request.ifrm);
                        document.body.removeChild(request.form);
                    },
                    200
                );
            }
            trig(events.end);
        }

        this.cancel = function () {
            if (request) {
                // src="javascript:false;" => doesn't trigger ie6 prompt on https
                setProperties(request.ifrm, {"src": "javascript:false;"});
                request.ifrm.parentNode.removeChild(request.ifrm);
                trig(events.uploadCancel, {idx: 0, name: request.name, filename: request.filename});
            }
            end();
        };

        trig(events.submit);
        main();
    }

    /**
    * CLASS XUpload
    ***************************************************************************/
    function XUpload($this, $input, config) {
        var $clone = $input.clone(),
            uploader;

        main();

        function trig(eventType, eventData) {
            eventData = eventData || {};
            eventData.xhr = isXhr;
            eventData.name = config.name;
            $this.trigger(eventType, eventData);
        }

        function change() {
            $(this).detach();
            uploader = isXhr ? new XhrUploader(config, trig, this.files) : new FrmUploader(config, trig, this);
        }

        function xhrDragAndDrop() {
            var $drop = config.drop === true ? $this : $(typeof config.drop === "function" ? config.drop.apply($this, []) : config.drop);

            if (!$drop.length) {
                return;
            }

            $drop.bind("dragover", function (event) {
                trig(events.dragOver, {event: event, container: $drop});
                var e = event.originalEvent,
                    effect = e.dataTransfer.effectAllowed;
                if (effect === "move" || effect === "linkMove") {
                    e.dataTransfer.dropEffect = "move"; // for FF (only move allowed)
                } else {
                    e.dataTransfer.dropEffect = "copy"; // for Chrome
                }
                //event.stopPropagation();
                //event.preventDefault();
                return false;
            });

            $drop.bind("dragenter", function (event) {
                trig(events.dragEnter, {event: event, container: $drop});
                event.preventDefault();
                return true;
            });

            $drop.bind("dragleave", function (event) {
                trig(events.dragLeave, {event: event, container: $drop});
            });

            $(document).bind("dragenter", function (event) {
                trig(events.documentDragEnter, {event: event, container: $drop});
            });

            $(document).bind("dragleave", function (event) {
                trig(events.documentDragLeave, {event: event, container: $drop});
            });

            $drop.bind("drop", function (event) {
                trig(events.drop, {event: event, container: $drop});
                event.stopPropagation();
                event.preventDefault();
                uploader = new XhrUploader(config, trig, event.originalEvent.dataTransfer.files);
            });
        }

        function main() {
            // bind drag & drop
            if (isXhr && config.drop) {
                xhrDragAndDrop();
            }

            // all download finished, create a new input
            $this.bind(events.end, function () {
                uploader = false;
                $input.remove();
                $input = $clone.clone();
                $input.change(change);
                $this.append($input);
            });

            // bind included callback
            $.each(events, function (i, eventType) {
                var onEventType = "on" + ucfirst(toCamel(eventType.split(".")[0]));
                if (typeof config[onEventType] === "function") {
                    $this.bind(eventType, function (e, data) {
                        if (data.name === config.name) {
                            config[onEventType].apply($this, [data]);
                        }
                    });
                }
            });

            // bind file change (upload file)
            $input.change(change);
        }

        this.cancel = function (idx) {
            if (uploader) {
                uploader.cancel(idx);
            }
        };
    }

    $.fn.xupload = function (mixed) {
        if (mixed === "cancel") {
            var idx = arguments[1];
            $.each(this, function () {
                var xupload = $(this).data("xupload");
                if (xupload) {
                    xupload.cancel(idx);
                }
            });
        } else if (mixed === "prettysize") {
            return formatSize(arguments[1], arguments[2]);
        } else {
            var config = mixed || {},
                multiple = isXhr ? config.multiple === undef || config.multiple : false,
                $input,
                $drop,
                i;

            // default values
            config.drop = config.drop === undef || config.drop;
            config.credential = config.credential === undef ? false : config.credential;
            config.action = config.action || "?";
            config.ext = typeof config.ext === "string" ? [config.ext] : config.ext || [];
            config.size = sizetoByte(config.size);
            for (i = 0; i < config.ext.length; i += 1) {
                config.ext[i] = config.ext[i].toLowerCase();
            }

            // loop on each jQuery object
            $.each(this, function () {
                var $this = $(this),
                    $input,
                    name,
                    conf = $.extend(true, {}, config);
                if ($this.data("xupload")) { // already initialised
                    return;
                }

                $input = $("input[type=file]", $this).first();

                conf.name = $this.attr("name") || conf.name;
                if (!conf.name) {
                    uniqueId += 1;
                    name = namespace + "_default_name_" + uniqueId;
                }

                if (!$input.length) {
                    $input = $("<input type='file' name='" + name + "'" + (multiple ? " multiple" : "") + ">");
                    $this.append($input);
                }

                mcGrady($this, $input);

                conf.params = typeof conf.params === "function" ? conf.params.apply($this, []) : conf.params || {};

                $this.data("xupload", new XUpload($this, $input, conf));
            });
        }
        return this;
    };

}(jQuery));
