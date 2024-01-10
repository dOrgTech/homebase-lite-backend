// swagger.js
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
  // Paths to files containing OpenAPI definitions
  apis: ['./routes/*.js'],
};

const swaggerSpec = swaggerJsdoc(swaggerOptions);

// Set up Swagger UI route
router.use('/', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

module.exports = router;
