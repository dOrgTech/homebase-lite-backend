const express = require('express');
const router = express.Router();
const swaggerUi = require('swagger-ui-express');
const swaggerJsdoc = require('swagger-jsdoc');

// Swagger definition
const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Homebase Lite Backend API',
      version: '1.0.0',
      description: 'API documentation for Homebase Lite Backend',
    },
  },
  apis: ['./routes/*.js'],
};

const swaggerSpec = swaggerJsdoc(swaggerOptions);

// Serve static files for Swagger UI
router.use(swaggerUi.serve);

// Custom middleware for serving Swagger UI only on the root path
router.get('/', (req, res) => {
  res.send(swaggerUi.generateHTML(swaggerSpec));
});

module.exports = router;