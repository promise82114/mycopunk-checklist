import { solvePacking } from './build-solver.js';

self.onmessage = event => {
  const { requestId, input } = event.data;
  try { self.postMessage({ requestId, result: solvePacking(input) }); }
  catch (error) { self.postMessage({ requestId, error: error.message }); }
};
