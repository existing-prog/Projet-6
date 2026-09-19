const http = require('http');
const app = require('./app');

const port = 4000;
app.set('port', port);

const server = http.createServer(app);

server.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});