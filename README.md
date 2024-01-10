## Homebase Lite Backend

### Overview

Homebase Lite Backend is an Express API server primarily designed for handling signed proposal data using public key cryptography. The core functionalities include verifying the signature of the data, saving it to MongoDB, and subsequently sharing it with the frontend. The backend handles the 'lite' DAO (Decentralized Autonomous Organization) aspects, where the bulk of the logic is implemented.

### Note on Current Deployment and Development
- The main deployment environment is referred to as 'dev', although it serves as the production environment.
- The project wasn't developed by a backend-focused developer, the coding standards and practices might need refinement and improvement.

### Table of Contents
- [Homebase Lite Backend](#homebase-lite-backend)
  - [Overview](#overview)
  - [Note on Current Deployment and Development](#note-on-current-deployment-and-development)
  - [Table of Contents](#table-of-contents)
  - [Prerequisites](#prerequisites)
  - [Setup](#setup)
  - [Configuration](#configuration)
  - [Docker Compose](#docker-compose)
  - [API Documentation (Swagger)](#api-documentation-swagger)
  - [Deployment](#deployment)
  - [Contributing](#contributing)

### Prerequisites
- Node.js (currently, the latest version is supported)
- Docker & Docker Compose
- Basic understanding of JavaScript and Node.js environments

### Setup
1. Clone the repository:
   ```sh
   git clone git@github.com:dOrgTech/homebase-lite-backend.git
   cd homebase-lite-backend
   ```

2. Install dependencies (if running locally without Docker):
   ```sh
   yarn install
   ```

### Configuration
Create a `config.env` file based on the `config.env.example` provided in the repository. This file should contain all the necessary environment variables required by the application.

Example `config.env`:
```
NODE_ENV=production
ATLAS_URI=mongodb://your-mongodb-uri
PORT=5000
```

### Docker Compose
This project includes a `docker-compose.yml` file, which simplifies the process of setting up and running the application in a Docker container.

To start the application using Docker Compose:
```sh
docker-compose up
```

### API Documentation (Swagger)
The Swagger documentation for the API is accessible at the root URL of the application. This provides an interactive interface to explore and test the API endpoints.

### Deployment
The application is set up for production deployment and is currently deployed via a Git remote at `https://git.heroku.com/homebase-lite-backend-dev.git`. For deployment and access permissions, please reach out to the team.

### Contributing
If you're interested in contributing to the `homebase-lite-backend`:
1. Fork the repository.
2. Create a new branch for your feature.
3. Make your changes.
4. Submit a pull request with a comprehensive description of the changes.