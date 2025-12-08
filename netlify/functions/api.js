const serverless = require('serverless-http');
const { app, connectToMongoose } = require('../../server');

let handler = null;

const initializeHandler = async () => {
  if (!handler) {
    await connectToMongoose();
    handler = serverless(app);
  }
  return handler;
};

exports.handler = async (event, context) => {
  context.callbackWaitsForEmptyEventLoop = false;
  
  const serverlessHandler = await initializeHandler();
  return serverlessHandler(event, context);
};


