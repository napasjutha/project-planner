(function () {
  'use strict';

  function collectAllStyles() {
    return Array.from(document.styleSheets).map(function (sheet) {
      try {
        return Array.from(sheet.cssRules).map(function (r) { return r.cssText; }).join('\n');
      } catch (e) {
        return '';
      }
    }).join('\n');
  }

  function elementToPngBlob(el) {
    return new Promise(function (resolve, reject) {
      var rect = el.getBoundingClientRect();
      var width = rect.width;
      var height = rect.height;
      var styleText = collectAllStyles();
      var xml = new XMLSerializer().serializeToString(el);
      var svgData = '<svg xmlns="http://www.w3.org/2000/svg" width="' + width + '" height="' + height + '">' +
        '<foreignObject width="100%" height="100%">' +
        '<div xmlns="http://www.w3.org/1999/xhtml"><style>' + styleText + '</style>' + xml + '</div>' +
        '</foreignObject></svg>';
      var dataUri = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
      var img = new Image();
      img.onload = function () {
        var canvas = document.createElement('canvas');
        canvas.width = width * 2;
        canvas.height = height * 2;
        var ctx = canvas.getContext('2d');
        ctx.scale(2, 2);
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob(function (blob) {
          if (blob) resolve(blob); else reject(new Error('canvas.toBlob returned null'));
        }, 'image/png');
      };
      img.onerror = function () {
        reject(new Error('failed to rasterize element'));
      };
      img.src = dataUri;
    });
  }

  function copyElementAsImage(el) {
    if (!el || !el.firstChild) return;
    elementToPngBlob(el).then(function (blob) {
      return navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    }).catch(function (err) {
      window.alert('Copy as Image failed: ' + err.message);
    });
  }

  window.PP = window.PP || {};
  window.PP.copyElementAsImage = copyElementAsImage;
})();
