import express from 'express';

const app = express();

console.log('TEST SERVER STARTING...');

app.get('/hello', (req, res) => {
    console.log('GOT /hello request');
    res.json({ message: 'Hello works!' });
});

app.get('/health', (req, res) => {
    console.log('GOT /health request');
    res.json({ message: 'Health works!' });
});

app.listen(5001, () => {
    console.log('Test server on port 5001');
});
