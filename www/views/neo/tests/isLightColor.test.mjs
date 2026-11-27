// Run from www/views/neo: ../../node_modules/.bin/mocha tests/
import assert from 'node:assert/strict';
import {isLightColor} from '../src/Format.mjs';

describe('isLightColor (calendar check tick)', () => {
    it('is true for light colours: black tick', () => {
        assert.equal(isLightColor('ffeb3b'), true);
        assert.equal(isLightColor('#FFFFFF'), true);
        assert.equal(isLightColor('fff'), true)
    });

    it('is false for dark colours: white tick', () => {
        assert.equal(isLightColor('356772'), false);
        assert.equal(isLightColor('#000000'), false);
        assert.equal(isLightColor(''), false)
    })
});
