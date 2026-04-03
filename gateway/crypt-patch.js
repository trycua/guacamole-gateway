// Patch guacamole-lite's Crypt.js to use Buffer-based encrypt/decrypt
// instead of the buggy 'binary' string encoding that corrupts data.
const fs = require('fs');
const path = '/app/node_modules/guacamole-lite/lib/Crypt.js';

const patched = `const Crypto = require('crypto');

class Crypt {
    constructor(cypher, key) {
        this.cypher = cypher;
        this.key = Buffer.isBuffer(key) ? key : Buffer.from(key);
    }

    decrypt(encodedString) {
        const outer = JSON.parse(Buffer.from(encodedString, 'base64').toString('utf8'));
        const iv = Buffer.from(outer.iv, 'base64');
        const value = Buffer.from(outer.value, 'base64');
        const decipher = Crypto.createDecipheriv(this.cypher, this.key, iv);
        const decrypted = Buffer.concat([decipher.update(value), decipher.final()]);
        return JSON.parse(decrypted.toString('utf8'));
    }

    encrypt(jsonData) {
        const iv = Crypto.randomBytes(16);
        const cipher = Crypto.createCipheriv(this.cypher, this.key, iv);
        const encrypted = Buffer.concat([cipher.update(JSON.stringify(jsonData), 'utf8'), cipher.final()]);
        const data = { iv: iv.toString('base64'), value: encrypted.toString('base64') };
        return Buffer.from(JSON.stringify(data)).toString('base64');
    }
}

module.exports = Crypt;
`;

fs.writeFileSync(path, patched);
console.log('Crypt.js patched successfully');
