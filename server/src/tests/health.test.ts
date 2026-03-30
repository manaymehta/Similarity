import request from 'supertest';
import app from '../app.js';

describe('GET /health', () => { //desribe is used for grouping tests, like test suite
    it('should return 200 OK and a success message', async () => { // it is used for defining a test case
        const res = await request(app).get('/health');
        expect(res.statusCode).toEqual(200); // assertion that response status code is 200
        expect(res.body).toHaveProperty('status', 'ok'); // assertion that response body has a property status with value ok
        expect(res.body).toHaveProperty('message', 'Server is running'); // assertion that response body has a property message with value Server is running
    });
});
