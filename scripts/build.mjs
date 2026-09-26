import { mkdir, copyFile } from 'node:fs/promises';
await mkdir('dist/vendor', {recursive:true});
for (const name of ['three.module.js','three.core.js']) await copyFile(`node_modules/three/build/${name}`, `dist/vendor/${name}`);
console.log('Three.js copied into dist/vendor/.');
await copyFile('node_modules/three/LICENSE', 'dist/vendor/THREE-LICENSE.txt');
