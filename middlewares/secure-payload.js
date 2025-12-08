let DOMPurify;

function getDOMPurify() {
  if (!DOMPurify) {
    const createDOMPurify = require('dompurify');
    const { JSDOM } = require('jsdom');
    const window = new JSDOM('').window;
    DOMPurify = createDOMPurify(window);
    
    DOMPurify.setConfig({
      KEEP_CONTENT: true,
      RETURN_DOM: false,
      RETURN_DOM_FRAGMENT: false,
      RETURN_DOM_IMPORT: false,
      WHOLE_DOCUMENT: false,
      FORCE_BODY: false,
      ADD_TAGS: ['summary', 'details', 'caption', 'figure', 'figcaption'],
      FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'input', 'button', 'base'],
      FORBID_ATTR: [
        'onerror', 'onload', 'onclick', 'onmouseover', 'onmouseout', 'onmouseenter', 'onmouseleave',
        'onfocus', 'onblur', 'onchange', 'onsubmit', 'onreset', 'onselect', 'onabort',
        'ping', 'formaction', 'action', 'method'
      ]
    });
    
    DOMPurify.addHook('afterSanitizeAttributes', node => {
      if (node.hasAttribute('style')) {
        const styleAttr = node.getAttribute('style');
        const cleanedStyle = removePositioningStyles(styleAttr);
        
        if (cleanedStyle !== styleAttr) {
          if (cleanedStyle.trim()) {
            node.setAttribute('style', cleanedStyle);
          } else {
            node.removeAttribute('style');
          }
        }
      }
      
      if (node.hasAttribute('href')) {
        const href = node.getAttribute('href');
        if (/^\s*(?:javascript|data|vbscript|file):/i.test(href)) {
          node.removeAttribute('href');
        }
      }
      
      if (node.hasAttribute('src')) {
        const src = node.getAttribute('src');
        if (/^\s*(?:javascript|data|vbscript|file):/i.test(src)) {
          node.removeAttribute('src');
        }
      }
      
      if (node.tagName === 'A') {
        node.setAttribute('target', '_blank');
        node.setAttribute('rel', 'nofollow noopener noreferrer');
      }
    });
    
    DOMPurify.addHook('uponSanitizeAttribute', (node, data) => {
      if (data.attrName === 'style') {
        data.attrValue = data.attrValue
          .replace(/expression\s*\(.*\)/gi, '')
          .replace(/url\s*\(\s*['"]*\s*javascript:/gi, '')
          .replace(/url\s*\(\s*['"]*\s*data:/gi, '')
          .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
          .replace(/<\/?\s*script\s*>/gi, '');
      }
    });
  }
  
  return DOMPurify;
}

/**
 * Remove position:absolute and position:fixed from style strings
 * Also sanitize any embedded HTML or JavaScript
 * @param {string} styleString - CSS style string
 * @returns {string} - Cleaned style string
 */
function removePositioningStyles(styleString) {
  if (!styleString) return styleString;
  
  // First, remove any embedded script tags or other HTML
  let cleanedString = styleString
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<\/?\s*script\s*>/gi, '')
    .replace(/<[^>]*>/g, ''); // Remove any other HTML tags
  
  // Split the style string by semicolons and filter out position:absolute/fixed/relative
  const cleanedStyles = cleanedString
    .split(';')
    .filter(style => {
      const trimmed = style.trim();
      return !(
        trimmed.toLowerCase().startsWith('position:absolute') || 
        trimmed.toLowerCase().startsWith('position:fixed') ||
        trimmed.toLowerCase().startsWith('position:relative') ||
        trimmed.toLowerCase().match(/^\s*position\s*:\s*absolute/) ||
        trimmed.toLowerCase().match(/^\s*position\s*:\s*fixed/) ||
        trimmed.toLowerCase().match(/^\s*position\s*:\s*relative/)
      );
    })
    .map(style => style.trim())  // Trim each style to avoid extra spaces
    .filter(Boolean)  // Remove empty strings
    .join('; ');
    
  return cleanedStyles ? cleanedStyles + ';' : '';
}


/**
 * Recursively sanitizes an object's string properties to prevent XSS attacks
 * @param {*} obj - The object to sanitize
 * @param {Set} seen - Set of already processed objects to prevent circular refs
 * @returns {*} - The sanitized object
 */
function sanitizeObject(obj, seen = new WeakSet()) {
  const purify = getDOMPurify();
  
  if (obj === null || typeof obj !== 'object') {
    if (typeof obj === 'string') {
      return purify.sanitize(obj, {
        ALLOWED_TAGS: [
          'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'p', 'a', 'ul', 'ol',
          'li', 'b', 'i', 'strong', 'em', 'strike', 'code', 'hr', 'br', 'div',
          'table', 'thead', 'caption', 'tbody', 'tr', 'th', 'td', 'pre', 'span', 'img',
          'svg', 'summary', 'details', 'figure', 'figcaption'
        ],
        ALLOWED_ATTR: [
          'href', 'name', 'target', 'src', 'alt', 'class', 'id', 'style',
          'title', 'width', 'height', 'controls', 'download', 'rel',
          'border', 'colspan', 'rowspan', 'cellspacing', 'cellpadding',
          // Allow basic data-* attributes but they can be restricted further if needed
          'data-id', 'data-name', 'data-value', 'data-user'
        ],
        // Prevent usage of JavaScript URLs and event handlers
        FORBID_ATTR: [
          'onerror', 'onload', 'onclick', 'onmouseover', 'onmouseout', 'onmouseenter', 'onmouseleave',
          'onfocus', 'onblur', 'onchange', 'onsubmit', 'onreset', 'onselect', 'onabort',
          'formaction', 'action', 'method'
        ],
        // Strip JS events
        FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'input', 'button', 'base','style'],
        // Prevent potentially dangerous URLs
        SANITIZE_DOM: true,
        KEEP_CONTENT: true
      });
    }
    return obj;
  }
  
  // Detect circular references
  if (seen.has(obj)) {
    return '[Circular Reference]';
  }
  
  // Add object to seen set
  seen.add(obj);
  
  // Handle arrays
  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeObject(item, seen));
  }

  const sanitized = {};
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      const value = obj[key];
      
      if (typeof value === 'string') {
        if (key === 'style' || key.endsWith('Style') || key.includes('style')) {
          sanitized[key] = removePositioningStyles(value);
        } else {
          sanitized[key] = purify.sanitize(value, {
            ALLOWED_TAGS: [
              'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'p', 'a', 'ul', 'ol',
              'li', 'b', 'i', 'strong', 'em', 'strike', 'code', 'hr', 'br', 'div',
              'table', 'thead', 'caption', 'tbody', 'tr', 'th', 'td', 'pre', 'span', 'img',
              'svg', 'summary', 'details', 'figure', 'figcaption'
            ],
            ALLOWED_ATTR: [
              'href', 'name', 'target', 'src', 'alt', 'class', 'id', 'style',
              'title', 'width', 'height', 'controls', 'download', 'rel',
              'border', 'colspan', 'rowspan', 'cellspacing', 'cellpadding',
              // Allow basic data-* attributes
              'data-id', 'data-name', 'data-value', 'data-user'
            ],
            // Prevent usage of JavaScript URLs
            FORBID_ATTR: [
              'onerror', 'onload', 'onclick', 'onmouseover', 'onmouseout', 'onmouseenter', 'onmouseleave',
              'onfocus', 'onblur', 'onchange', 'onsubmit', 'onreset', 'onselect', 'onabort',
              'formaction', 'action', 'method'
            ],
            // Strip JS events
            FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'input', 'button', 'base'],
            // Prevent potentially dangerous URLs
            SANITIZE_DOM: true,
            KEEP_CONTENT: true
          });
        }
      } else if (typeof value === 'object' && value !== null) {
        // Recursively sanitize nested objects, passing the seen set
        sanitized[key] = sanitizeObject(value, seen);
      } else {
        // For non-string values, keep them as-is
        sanitized[key] = value;
      }
    }
  }
  
  return sanitized;
}

/**
 * Middleware to protect against XSS attacks
 * Sanitizes request body, query, and params
 */
const securePayload = (req, res, next) => {
  try {
    // Sanitize the request body, query params, and URL params
    if (req.body && typeof req.body === 'object') {
      req.body = sanitizeObject(req.body);
    }

    if (req.query && typeof req.query === 'object') {
      req.query = sanitizeObject(req.query);
    }

    if (req.params && typeof req.params === 'object') {
      req.params = sanitizeObject(req.params);
    }

    next();
  } catch (error) {
    console.error('XSS protection error:', error);
    return res.status(400).json({
      success: false,
      message: 'Potentially malicious content detected'
    });
  }
};

module.exports = securePayload;
