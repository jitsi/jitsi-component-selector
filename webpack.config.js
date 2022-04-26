const path = require('path');

module.exports = {
    target: 'node',
    entry: './dist/app.js',
    mode: 'production',
    output: {
        path: path.join(__dirname, 'bundle'),
        filename: 'app.js',
    },
    optimization: {
        minimize: false
    },
};
