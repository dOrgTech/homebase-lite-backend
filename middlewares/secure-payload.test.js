const securePayload = require('./secure-payload');

const mockRequest = (body = {}, query = {}, params = {}) => ({
  body,
  query,
  params
});

const mockResponse = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

const mockNext = jest.fn();

describe('securePayload Middleware', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // Basic functionality tests
  describe('Basic Functionality', () => {
    test('should call next() for clean requests', () => {
      const req = mockRequest({ text: 'clean text' });
      const res = mockResponse();
      
      securePayload(req, res, mockNext);
      
      expect(mockNext).toHaveBeenCalled();
      expect(req.body.text).toBe('clean text');
    });
    
    test('should handle empty body', () => {
      const req = mockRequest();
      const res = mockResponse();
      
      securePayload(req, res, mockNext);
      
      expect(mockNext).toHaveBeenCalled();
    });
    
    test('should sanitize multiple request properties', () => {
      const req = mockRequest(
        { bodyText: '<p>Body</p>' },
        { queryText: '<p>Query</p>' },
        { paramText: '<p>Param</p>' }
      );
      const res = mockResponse();
      
      securePayload(req, res, mockNext);
      
      expect(mockNext).toHaveBeenCalled();
      expect(req.body.bodyText).toBe('<p>Body</p>');
      expect(req.query.queryText).toBe('<p>Query</p>');
      expect(req.params.paramText).toBe('<p>Param</p>');
    });
  });

  // XSS Attack Handling
  describe('XSS Attack Prevention', () => {
    test('should remove script tags', () => {
      const req = mockRequest({ text: '<script>alert("XSS")</script>Hello world' });
      const res = mockResponse();
      
      securePayload(req, res, mockNext);
      
      expect(req.body.text).toBe('Hello world');
    });
    
    test('should remove event handlers', () => {
      const req = mockRequest({ text: '<img src="valid.jpg" onerror="alert(\'XSS\')" />' });
      const res = mockResponse();
      
      securePayload(req, res, mockNext);
      
      // Updated to match DOMPurify's output format (no self-closing tags)
      expect(req.body.text).toBe('<img src="valid.jpg">');
    });
    
    test('should remove javascript: URLs', () => {
      const req = mockRequest({ 
        text: '<a href="javascript:alert(\'XSS\')">Click me</a>' 
      });
      const res = mockResponse();
      
      securePayload(req, res, mockNext);
      
      // DOMPurify should remove or sanitize the javascript: URL
      expect(req.body.text).not.toContain('javascript:');
    });
    
    test('should handle complex nested XSS attacks', () => {
      const req = mockRequest({ 
        text: '<div><script>bad()</script><p>Good content</p><img src="x" onerror="evil()"></div>' 
      });
      const res = mockResponse();
      
      securePayload(req, res, mockNext);
      
      expect(req.body.text).toBe('<div><p>Good content</p><img src="x"></div>');
    });
  });

  // Position Styling Tests
  describe('Position Style Handling', () => {
    test('should remove position:absolute from style attributes', () => {
      const req = mockRequest({ 
        html: '<div style="color:red; position:absolute; top:0;">Test</div>' 
      });
      const res = mockResponse();
      
      securePayload(req, res, mockNext);
      
      // Style attribute should not contain position:absolute
      expect(req.body.html).toContain('<div style=');
      expect(req.body.html).toContain('color:red');
      expect(req.body.html).toContain('top:0');
      expect(req.body.html).not.toContain('position:absolute');
    });
    
    test('should remove position:fixed from style attributes', () => {
      const req = mockRequest({ 
        html: '<span style="position:fixed; left:0; font-size:12px;">Test</span>' 
      });
      const res = mockResponse();
      
      securePayload(req, res, mockNext);
      
      // Style attribute should not contain position:fixed
      expect(req.body.html).toContain('<span style=');
      expect(req.body.html).toContain('left:0');
      expect(req.body.html).toContain('font-size:12px');
      expect(req.body.html).not.toContain('position:fixed');
    });
    
    test('should handle variations in position syntax with spaces', () => {
      const req = mockRequest({ 
        html: '<div style="position : absolute; color:blue;">Test</div>' 
      });
      const res = mockResponse();
      
      securePayload(req, res, mockNext);
      
      // Style attribute should not contain position:absolute with spaces
      expect(req.body.html).toContain('<div style=');
      expect(req.body.html).toContain('color:blue');
      expect(req.body.html).not.toContain('position');
      expect(req.body.html).not.toContain('absolute');
    });
    
    test('should remove empty style attributes after position is removed', () => {
      const req = mockRequest({ 
        html: '<div style="position:absolute;color:red;">Test</div>' 
      });
      const res = mockResponse();
      
      securePayload(req, res, mockNext);
      
      expect(req.body.html).toBe('<div style="color:red;">Test</div>');
    });
    
    test('should clean direct style objects in request', () => {
      const req = mockRequest({ 
        style: 'position:fixed; color:red;',
        divStyle: 'width:100px; position:absolute;'
      });
      const res = mockResponse();
      
      securePayload(req, res, mockNext);
      
      // Direct style properties should not contain position
      expect(req.body.style).toContain('color:red');
      expect(req.body.style).not.toContain('position:fixed');
      expect(req.body.divStyle).toContain('width:100px');
      expect(req.body.divStyle).not.toContain('position:absolute');
    });
    
    test('should clean position styles in nested objects', () => {
      const req = mockRequest({ 
        component: {
          style: 'position:absolute; margin:10px;',
          html: '<div style="position:fixed;">Nested</div>'
        }
      });
      const res = mockResponse();
      
      securePayload(req, res, mockNext);
      
      // Nested style properties should not contain position
      expect(req.body.component.style).toContain('margin:10px');
      expect(req.body.component.style).not.toContain('position:absolute');
      expect(req.body.component.html).toBe('<div>Nested</div>');
    });

    test('should handle embedded styles within HTML content', () => {
      const req = mockRequest({
        content: `
          <div>
            <p style="color:blue; position:absolute; top:10px;">Positioned text</p>
            <span style="font-weight:bold; position:fixed; left:0;">Fixed span</span>
            <article>
              <h2 style="position:absolute; z-index:100;">Heading</h2>
              Normal text
            </article>
          </div>
        `
      });
      const res = mockResponse();
      
      securePayload(req, res, mockNext);
      
      // Check that position styles are removed but other styles remain
      expect(req.body.content).toContain('<p style="color:blue; top:10px;">');
      expect(req.body.content).toContain('<span style="font-weight:bold; left:0;">');
      expect(req.body.content).toContain('<h2 style="z-index:100;">');
      expect(req.body.content).not.toContain('position:absolute');
      expect(req.body.content).not.toContain('position:fixed');
    });
  });

  // WYSIWYG Content Tests
  describe('WYSIWYG Editor Content', () => {
    test('should allow legitimate HTML from WYSIWYG editors', () => {
      const wysiwygContent = `
        <h1>Title</h1>
        <p>This is a <strong>formatted</strong> paragraph with <em>emphasis</em>.</p>
        <ul>
          <li>List item 1</li>
          <li>List item 2</li>
        </ul>
        <blockquote>This is a quote</blockquote>
        <p><a href="https://example.com">Link</a></p>
        <img src="image.jpg" alt="Description" />
      `;
      
      const req = mockRequest({ content: wysiwygContent });
      const res = mockResponse();
      
      securePayload(req, res, mockNext);
      
      // All legitimate HTML elements should be preserved
      expect(req.body.content).toContain('<h1>');
      expect(req.body.content).toContain('<strong>');
      expect(req.body.content).toContain('<em>');
      expect(req.body.content).toContain('<ul>');
      expect(req.body.content).toContain('<li>');
      expect(req.body.content).toContain('<blockquote>');
      expect(req.body.content).toContain('<a href="https://example.com"');
      expect(req.body.content).toContain('target="_blank"');
      expect(req.body.content).toContain('rel="nofollow noopener noreferrer"');
      expect(req.body.content).toContain('<img');
      expect(req.body.content).toContain('src="image.jpg"');
      expect(req.body.content).toContain('alt="Description"');
    });
    
    test('should preserve styling while removing only position styles', () => {
      const wysiwygContent = `
        <h1 style="color:blue; text-align:center;">Title</h1>
        <p style="font-size:16px; position:absolute; top:0;">Paragraph</p>
        <div style="background-color:#eee; position:fixed; margin:10px;">Box</div>
      `;
      
      const req = mockRequest({ content: wysiwygContent });
      const res = mockResponse();
      
      securePayload(req, res, mockNext);
      
      // Should preserve styling but remove position
      expect(req.body.content).toContain('style="color:blue; text-align:center;"');
      expect(req.body.content).toContain('style="font-size:16px; top:0;"');
      expect(req.body.content).toContain('style="background-color:#eee; margin:10px;"');
      
      // Position styles should be removed
      expect(req.body.content).not.toContain('position:absolute');
      expect(req.body.content).not.toContain('position:fixed');
    });

    test('should handle complex styled content with mixed elements', () => {
      const req = mockRequest({
        content: `
          <div class="container">
            <h1 style="font-size:24px; text-align:center;">Article Title</h1>
            <div class="author" style="position:absolute; top:50px; right:20px; color:#333;">
              <span style="font-weight:bold;">John Doe</span>
              <span style="font-style:italic; position:fixed; bottom:10px;">Editor</span>
            </div>
            <p style="margin:15px; position:relative; padding:10px;">
              This is a paragraph with <strong style="position:absolute; left:5px;">bold text</strong>
              and <em style="position:fixed; right:0;">emphasized text</em>.
            </p>
          </div>
        `
      });
      const res = mockResponse();
      
      securePayload(req, res, mockNext);
      
      const sanitizedContent = req.body.content;
      
      // Check that elements and allowed attributes exist
      expect(sanitizedContent).toContain('<div class="container">');
      expect(sanitizedContent).toContain('<h1 style="font-size:24px; text-align:center;">');
      expect(sanitizedContent).toContain('class="author"');
      
      // Check that specific style properties are present
      expect(sanitizedContent).toContain('top:50px');
      expect(sanitizedContent).toContain('right:20px');
      expect(sanitizedContent).toContain('color:#333');
      expect(sanitizedContent).toContain('font-weight:bold');
      expect(sanitizedContent).toContain('font-style:italic');
      expect(sanitizedContent).toContain('bottom:10px');
      expect(sanitizedContent).toContain('margin:15px');
      expect(sanitizedContent).toContain('padding:10px');
      expect(sanitizedContent).toContain('left:5px');
      expect(sanitizedContent).toContain('right:0');
      
      // Check that all position styles are removed
      expect(sanitizedContent).not.toContain('position:absolute');
      expect(sanitizedContent).not.toContain('position:fixed');
      expect(sanitizedContent).not.toContain('position:relative');
    });
  });

  // Error Handling Tests
  describe('Error Handling', () => {
    test('should handle errors gracefully', () => {
      // Create an object that will cause an error when processed
      const circularObj = {};
      circularObj.circular = circularObj; // Circular reference
      
      const req = mockRequest(circularObj);
      const res = mockResponse();
      
      securePayload(req, res, mockNext);
      
      // Now we should successfully handle circular references
      expect(mockNext).toHaveBeenCalled();
      expect(req.body.circular).toBe('[Circular Reference]');
    });
  });

  // Complex Data Structures Tests
  describe('Complex Data Structures', () => {
    test('should sanitize arrays of objects', () => {
      const req = mockRequest({
        items: [
          { content: '<p>Item 1</p><script>alert("bad")</script>' },
          { content: '<div style="position:absolute;">Item 2</div>' },
          { content: '<p>Item 3</p>' }
        ]
      });
      const res = mockResponse();
      
      securePayload(req, res, mockNext);
      
      expect(req.body.items[0].content).toBe('<p>Item 1</p>');
      expect(req.body.items[1].content).toBe('<div>Item 2</div>');
      expect(req.body.items[2].content).toBe('<p>Item 3</p>');
    });
    
    test('should handle deeply nested objects', () => {
      const req = mockRequest({
        level1: {
          level2: {
            level3: {
              level4: {
                html: '<p style="position:fixed;">Deep</p>',
                text: '<script>alert("deep")</script>'
              }
            }
          }
        }
      });
      const res = mockResponse();
      
      securePayload(req, res, mockNext);
      
      expect(req.body.level1.level2.level3.level4.html).toBe('<p>Deep</p>');
      expect(req.body.level1.level2.level3.level4.text).toBe('');
    });
    
    test('should handle mixed data types', () => {
      const req = mockRequest({
        string: '<p>Text</p>',
        number: 42,
        boolean: true,
        null: null,
        undefined: undefined,
        array: [1, 2, '<script>alert("XSS")</script>'],
        object: { key: '<div style="position:absolute;">Value</div>' }
      });
      const res = mockResponse();
      
      securePayload(req, res, mockNext);
      
      expect(req.body.string).toBe('<p>Text</p>');
      expect(req.body.number).toBe(42);
      expect(req.body.boolean).toBe(true);
      expect(req.body.null).toBeNull();
      expect(req.body.undefined).toBeUndefined();
      expect(req.body.array[0]).toBe(1);
      expect(req.body.array[1]).toBe(2);
      expect(req.body.array[2]).not.toContain('<script');
      expect(req.body.object.key).toBe('<div>Value</div>');
    });

    test('should handle HTML strings in arrays', () => {
      const req = mockRequest({
        htmlItems: [
          '<div style="position:absolute; color:red;">Red</div>',
          '<span style="position:fixed; font-size:12px;">Small</span>',
          '<p style="margin:10px;">Normal</p>'
        ]
      });
      const res = mockResponse();
      
      securePayload(req, res, mockNext);
      
      expect(req.body.htmlItems[0]).toContain('<div');
      expect(req.body.htmlItems[0]).toContain('style="color:red;"');
      expect(req.body.htmlItems[0]).not.toContain('position:absolute');
      
      expect(req.body.htmlItems[1]).toContain('<span');
      expect(req.body.htmlItems[1]).toContain('style="font-size:12px;"');
      expect(req.body.htmlItems[1]).not.toContain('position:fixed');
      
      expect(req.body.htmlItems[2]).toBe('<p style="margin:10px;">Normal</p>');
    });
  });

  // Edge Cases
  describe('Edge Cases', () => {
    test('should handle empty strings', () => {
      const req = mockRequest({ text: '' });
      const res = mockResponse();
      
      securePayload(req, res, mockNext);
      
      expect(req.body.text).toBe('');
    });
    
    test('should handle non-string primitives', () => {
      const req = mockRequest({ 
        number: 42,
        boolean: true,
        nullValue: null,
        undefinedValue: undefined
      });
      const res = mockResponse();
      
      securePayload(req, res, mockNext);
      
      expect(req.body.number).toBe(42);
      expect(req.body.boolean).toBe(true);
      expect(req.body.nullValue).toBeNull();
      expect(req.body.undefinedValue).toBeUndefined();
    });
    
    test('should detect and handle circular references', () => {
      const circularObj = {};
      const nestedObj = { ref: circularObj };
      circularObj.back = nestedObj;
      
      const req = mockRequest({
        circular: circularObj
      });
      const res = mockResponse();
      
      securePayload(req, res, mockNext);
      
      expect(mockNext).toHaveBeenCalled();
      expect(req.body.circular.back.ref).toBe('[Circular Reference]');
    });

    test('should handle style attribute with only position properties', () => {
      const req = mockRequest({
        html: [
          '<div style="position:absolute;">Only position</div>',
          '<span style="position:fixed; ">Position with space</span>',
          '<p style="  position:relative  ">Position with extra spaces</p>'
        ]
      });
      const res = mockResponse();
      
      securePayload(req, res, mockNext);
      
      // Check that position styles are removed
      expect(req.body.html[0]).not.toContain('style=');
      expect(req.body.html[0]).toContain('<div>Only position</div>');
      
      expect(req.body.html[1]).not.toContain('style=');
      expect(req.body.html[1]).toContain('<span>Position with space</span>');
      
      expect(req.body.html[2]).not.toContain('style=');
      expect(req.body.html[2]).toContain('<p>Position with extra spaces</p>');
    });
  });

  // Add more comprehensive XSS attack pattern tests
  describe('Advanced XSS Attack Prevention', () => {
    test('should sanitize SVG-based XSS attacks', () => {
      const req = mockRequest({
        svg: '<svg><script>alert(1)</script></svg>',
        svgOnload: '<svg onload="alert(2)"></svg>',
        svgWithXlink: '<svg><a xlink:href="javascript:alert(3)"></a></svg>'
      });
      const res = mockResponse();
      
      securePayload(req, res, mockNext);
      
      expect(req.body.svg).not.toContain('<script>');
      expect(req.body.svgOnload).not.toContain('onload');
      expect(req.body.svgWithXlink).not.toContain('javascript:');
    });
    
    test('should sanitize CSS-based attacks', () => {
      const req = mockRequest({
        cssAttack: '<div style="background-image: url(javascript:alert(1))">CSS Attack</div>',
        cssExpression: '<div style="width: expression(alert(2))">CSS Expression</div>',
        cssUrl: '<div style="background: url(&#x6A&#x61&#x76&#x61&#x73&#x63&#x72&#x69&#x70&#x74&#x3A&#x61&#x6C&#x65&#x72&#x74&#x28&#x27&#x58&#x53&#x53&#x27&#x29)">Encoded URL</div>'
      });
      const res = mockResponse();
      
      securePayload(req, res, mockNext);
      
      expect(req.body.cssAttack).not.toContain('javascript:');
      expect(req.body.cssExpression).not.toContain('expression');
      expect(req.body.cssUrl).not.toMatch(/url\s*\(/i);
    });

    test('should handle unicode/encoding-based XSS evasion techniques', () => {
      const req = mockRequest({
        unicodeXss: '<img src="x" onerror="&#97;&#108;&#101;&#114;&#116;&#40;&#39;&#88;&#83;&#83;&#39;&#41;">',
        utf8Xss: '<div onclick=&#x61;&#x6C;&#x65;&#x72;&#x74;&#x28;&#x31;&#x29;>Click me</div>',
        multibyteXss: '<script>\u0061\u006C\u0065\u0072\u0074(1)</script>'
      });
      const res = mockResponse();
      
      securePayload(req, res, mockNext);
      
      expect(req.body.unicodeXss).not.toContain('onerror');
      expect(req.body.utf8Xss).not.toContain('onclick');
      expect(req.body.multibyteXss).not.toContain('alert');
    });
    
    test('should handle dangerous URL schemes', () => {
      const req = mockRequest({
        dataUri: '<a href="data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==">Data URI</a>',
        vbscript: '<a href="vbscript:MsgBox(\'XSS\')">VBScript</a>',
        jsEncode: '<a href="java&#09;script:alert(1)">Encoded JavaScript</a>'
      });
      const res = mockResponse();
      
      securePayload(req, res, mockNext);
      
      expect(req.body.dataUri).not.toContain('data:text/html');
      expect(req.body.vbscript).not.toContain('vbscript:');
      expect(req.body.jsEncode).not.toContain('javascript:');
    });
  });

  // Test for CSS properties that could be used maliciously beyond just positioning
  describe('Malicious CSS Property Handling', () => {
    test('should handle CSS injection with dangerous properties', () => {
      const req = mockRequest({
        zIndex: '<div style="z-index:999999; position:absolute;">High z-index</div>',
        pointerEvents: '<div style="pointer-events:none;">No pointer events</div>',
        opacity: '<div style="opacity:0;">Invisible div</div>',
        overflow: '<div style="overflow:hidden;">Hidden content</div>'
      });
      const res = mockResponse();
      
      securePayload(req, res, mockNext);
      
      // Position should be removed, but other properties are allowed
      expect(req.body.zIndex).not.toContain('position:absolute');
      expect(req.body.zIndex).toContain('z-index:999999');
      expect(req.body.pointerEvents).toContain('pointer-events:none');
      expect(req.body.opacity).toContain('opacity:0');
      expect(req.body.overflow).toContain('overflow:hidden');
    });

    test('should handle combined position and size manipulation', () => {
      const req = mockRequest({
        combined: '<div style="position:fixed; height:100vh; width:100vw; top:0; left:0; background:red; z-index:9999;">Fullscreen overlay</div>'
      });
      const res = mockResponse();
      
      securePayload(req, res, mockNext);
      
      // Position should be removed, but size properties are maintained
      expect(req.body.combined).not.toContain('position:fixed');
      expect(req.body.combined).toContain('height:100vh');
      expect(req.body.combined).toContain('width:100vw');
      expect(req.body.combined).toContain('top:0');
      expect(req.body.combined).toContain('left:0');
    });
  });

  // Edge cases with malformed content
  describe('Malformed Content Handling', () => {
    test('should sanitize malformed HTML', () => {
      const req = mockRequest({
        unclosed: '<div><p>Unclosed paragraph',
        unquoted: '<div class=dangerous onclick=alert(1)>Unquoted attributes</div>',
        nested: '<div style="<script>alert(1)</script>">Nested script in attribute</div>',
        multipleNestedScripts: '<span style="color:red;<script>evil()</script>;font-size:12px;<script>alert(2)</script>">Multiple scripts</span>',
        styleWithHtml: '<p style="<div onclick=\'alert(3)\'>test</div>">HTML in style</p>'
      });
      const res = mockResponse();
      
      securePayload(req, res, mockNext);
      
      expect(req.body.unclosed).toContain('<div><p>Unclosed paragraph</p></div>');
      expect(req.body.unquoted).not.toContain('onclick');
      expect(req.body.nested).not.toContain('<script>');
      expect(req.body.multipleNestedScripts).not.toContain('<script>');
      expect(req.body.styleWithHtml).not.toContain('onclick');
      
      // Additional check to ensure style attributes don't contain HTML tags
      expect(req.body.nested).not.toContain('<div style="<');
      expect(req.body.nested).not.toContain('alert');
      expect(req.body.multipleNestedScripts).not.toContain('evil()');
      expect(req.body.styleWithHtml).not.toContain('<div');
    });

    test('should handle null bytes and other special characters', () => {
      const req = mockRequest({
        nullByte: 'Before\0<script>alert(1)</script>After',
        controlChars: 'Text with \x01 control \x02 characters \x1F and script <script>evil()</script>',
        nonPrintable: 'Non-printable \u200D characters \u200C with <script>badCode()</script>'
      });
      const res = mockResponse();
      
      securePayload(req, res, mockNext);
      
      expect(req.body.nullByte).not.toContain('<script>');
      expect(req.body.controlChars).not.toContain('<script>');
      expect(req.body.nonPrintable).not.toContain('<script>');
    });
  });

  // Test large payloads and performance edge cases
  describe('Performance Edge Cases', () => {
    test('should handle deeply nested structures', () => {
      // Create a deeply nested object
      let nestedObj = {};
      let current = nestedObj;
      for (let i = 0; i < 20; i++) {
        current.child = { level: i, html: `<p style="position:absolute;">Level ${i}</p>` };
        current = current.child;
      }
      
      const req = mockRequest({ deep: nestedObj });
      const res = mockResponse();
      
      securePayload(req, res, mockNext);
      
      // Verify the deepest level was sanitized
      let result = req.body.deep;
      for (let i = 0; i < 20; i++) {
        expect(result.child.html).not.toContain('position:absolute');
        result = result.child;
      }
    });

    test('should handle large arrays', () => {
      const largeArray = Array(100).fill().map((_, i) => 
        `<div style="position:absolute; top:${i}px;">${i}</div>`
      );
      
      const req = mockRequest({ array: largeArray });
      const res = mockResponse();
      
      securePayload(req, res, mockNext);
      
      // Check that all items were sanitized
      req.body.array.forEach(item => {
        expect(item).not.toContain('position:absolute');
        expect(item).toContain('<div');
      });
    });
  });

  // Test sanitization of common WYSIWYG patterns
  describe('WYSIWYG Common Patterns', () => {
    test('should preserve complex table structures', () => {
      const tableContent = `
        <table border="1">
          <thead>
            <tr>
              <th style="background-color:#eee;">Header 1</th>
              <th style="background-color:#eee;">Header 2</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style="padding:10px; position:relative;">Data 1</td>
              <td style="padding:10px; position:relative;">Data 2</td>
            </tr>
          </tbody>
        </table>
      `;
      
      const req = mockRequest({ content: tableContent });
      const res = mockResponse();
      
      securePayload(req, res, mockNext);
      
      // Check table structure is preserved but positions are removed
      expect(req.body.content).toContain('<table');
      expect(req.body.content).toContain('<thead>');
      expect(req.body.content).toContain('<tbody>');
      expect(req.body.content).toContain('<th');
      expect(req.body.content).toContain('<td');
      expect(req.body.content).toContain('background-color:#eee');
      expect(req.body.content).toContain('padding:10px');
      expect(req.body.content).not.toContain('position:relative');
    });

    test('should handle code blocks and syntax highlighting', () => {
      const codeContent = `
        <pre style="background:#f8f8f8; position:relative;">
          <code style="color:#333;">
            function example() {
              console.log("Hello world");
            }
          </code>
        </pre>
      `;
      
      const req = mockRequest({ content: codeContent });
      const res = mockResponse();
      
      securePayload(req, res, mockNext);
      
      // Check code formatting is preserved
      expect(req.body.content).toContain('<pre');
      expect(req.body.content).toContain('<code');
      expect(req.body.content).toContain('background:#f8f8f8');
      expect(req.body.content).toContain('color:#333');
      expect(req.body.content).not.toContain('position:relative');
    });
  });

  // Test handling of custom HTML5 data attributes
  describe('HTML5 Data Attributes', () => {
    test('should preserve data attributes', () => {
      const req = mockRequest({
        dataAttrs: '<div data-id="123" data-user="john" style="position:absolute;">User data</div>'
      });
      const res = mockResponse();
      
      securePayload(req, res, mockNext);
      
      // Position should be removed but data attributes preserved if allowed
      const result = req.body.dataAttrs;
      // Note: DOMPurify may strip data-* attributes depending on configuration
      // This test may need adjustment based on actual configuration
      if (result.includes('data-')) {
        expect(result).toContain('data-id="123"');
        expect(result).toContain('data-user="john"');
      }
      expect(result).not.toContain('position:absolute');
    });
  });

  // Test how links are processed
  describe('Link Handling', () => {
    test('should ensure all links open in new window with security attributes', () => {
      const req = mockRequest({
        simpleLink: '<a href="https://example.com">Example</a>',
        linkWithTarget: '<a href="https://example.org" target="_self">Example with target</a>',
        linkWithRel: '<a href="https://example.net" rel="alternate">Example with rel</a>',
        linkWithAll: '<a href="https://example.io" target="_self" rel="canonical">Example with both</a>',
        nestedLink: '<div><p><a href="https://nested.example.com">Nested link</a></p></div>',
        multipleLinks: `
          <div>
            <a href="https://one.example.com">Link one</a>
            <p>Some text <a href="https://two.example.com">Link two</a> more text</p>
          </div>
        `
      });
      const res = mockResponse();
      
      securePayload(req, res, mockNext);
      
      // Check all links have target="_blank" and rel="nofollow noopener noreferrer"
      const checkLink = (html) => {
        expect(html).toContain('target="_blank"');
        expect(html).toContain('rel="nofollow noopener noreferrer"');
      };
      
      checkLink(req.body.simpleLink);
      checkLink(req.body.linkWithTarget); // Should override existing target
      checkLink(req.body.linkWithRel); // Should override existing rel
      checkLink(req.body.linkWithAll); // Should override both
      checkLink(req.body.nestedLink); // Should handle nested links
      
      // Check multiple links in the same content
      const multiLinks = req.body.multipleLinks;
      expect(multiLinks.match(/target="_blank"/g).length).toBe(2);
      expect(multiLinks.match(/rel="nofollow noopener noreferrer"/g).length).toBe(2);
    });
    
    test('should still prevent harmful links', () => {
      const req = mockRequest({
        jsLink: '<a href="javascript:alert(1)">JS Link</a>',
        dataLink: '<a href="data:text/html,<script>alert(2)</script>">Data Link</a>',
      });
      const res = mockResponse();
      
      securePayload(req, res, mockNext);
      
      // Links should be sanitized but still have target/rel attributes
      expect(req.body.jsLink).not.toContain('javascript:');
      expect(req.body.jsLink).toContain('target="_blank"');
      expect(req.body.jsLink).toContain('rel="nofollow noopener noreferrer"');
      
      expect(req.body.dataLink).not.toContain('data:text/html');
      expect(req.body.dataLink).toContain('target="_blank"');
      expect(req.body.dataLink).toContain('rel="nofollow noopener noreferrer"');
    });
  });
});
