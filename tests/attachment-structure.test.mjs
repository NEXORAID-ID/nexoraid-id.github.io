import test from 'node:test';
import assert from 'node:assert/strict';
import {imageMime} from '../v4/collaboration.mjs';
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC','base64');
const jpeg=Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDi6KKK+ZP3E//Z','base64');
test('valid small PNG and JPEG pass bounded structural validation',()=>{
 assert.equal(imageMime(png),'image/png');assert.equal(imageMime(jpeg),'image/jpeg');
});
test('PNG rejects header-only, truncation, CRC corruption and trailing bytes',()=>{
 assert.equal(imageMime(png.subarray(0,20)),null);
 assert.equal(imageMime(png.subarray(0,png.length-1)),null);
 const corrupt=Buffer.from(png);corrupt[45]^=1;assert.equal(imageMime(corrupt),null);
 assert.equal(imageMime(Buffer.concat([png,Buffer.from('extra')])),null);
});
test('JPEG rejects fake signature, malformed segments, missing scan and missing EOI',()=>{
 assert.equal(imageMime(Buffer.from([255,216,255,224,0,4,1,2,3,4,5,6,7,8,255,217])),null);
 assert.equal(imageMime(jpeg.subarray(0,jpeg.length-2)),null);
 const corrupt=Buffer.from(jpeg);corrupt[4]=255;corrupt[5]=255;assert.equal(imageMime(corrupt),null);
 const sof=jpeg.indexOf(Buffer.from([255,192]));assert.ok(sof>0);const large=Buffer.from(jpeg);large.writeUInt16BE(9000,sof+5);assert.equal(imageMime(large),null);
});
test('oversized and nonimage inputs are rejected',()=>{
 assert.equal(imageMime(Buffer.alloc(524289)),null);assert.equal(imageMime(Buffer.from('<svg onload=alert(1)>')),null);assert.equal(imageMime(null),null);
});
