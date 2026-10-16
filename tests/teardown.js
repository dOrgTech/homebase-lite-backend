const mongoose = require('mongoose');

afterAll(async () => {
  if (global.axiosMock) {
    global.axiosMock.restore();
  }
  
  if (mongoose.connection.readyState !== 0) {
    await mongoose.connection.close();
  }
});

