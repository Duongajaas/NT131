import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const getManualChunk = (id: string): string | undefined => {
	const normalizedId = id.replaceAll('\\', '/');

	if (!normalizedId.includes('/node_modules/')) {
		return undefined;
	}

	if (normalizedId.includes('/node_modules/three/')) {
		return 'three-core';
	}

	if (normalizedId.includes('/node_modules/@react-three/fiber/')) {
		return 'r3f-core';
	}

	if (normalizedId.includes('/node_modules/@react-three/drei/')) {
		return 'drei-core';
	}

	if (
		normalizedId.includes('/node_modules/three-stdlib/') ||
		normalizedId.includes('/node_modules/three-mesh-bvh/')
	) {
		return 'three-helpers';
	}

	if (
		normalizedId.includes('/node_modules/maath/') ||
		normalizedId.includes('/node_modules/meshline/') ||
		normalizedId.includes('/node_modules/stats-gl/')
	) {
		return 'scene-math';
	}

	if (
		normalizedId.includes('/node_modules/troika-three-text/') ||
		normalizedId.includes('/node_modules/troika-three-utils/') ||
		normalizedId.includes('/node_modules/troika-worker-utils/') ||
		normalizedId.includes('/node_modules/webgl-sdf-generator/') ||
		normalizedId.includes('/node_modules/bidi-js/')
	) {
		return 'troika-text';
	}

	if (
		normalizedId.includes('/node_modules/react/') ||
		normalizedId.includes('/node_modules/react-dom/') ||
		normalizedId.includes('/node_modules/scheduler/')
	) {
		return 'react';
	}

	if (
		normalizedId.includes('/node_modules/socket.io-client/') ||
		normalizedId.includes('/node_modules/engine.io-client/') ||
		normalizedId.includes('/node_modules/engine.io-parser/') ||
		normalizedId.includes('/node_modules/socket.io-parser/')
	) {
		return 'socket';
	}

	return undefined;
};

export default defineConfig({
	plugins: [react()],
	build: {
		chunkSizeWarningLimit: 1100,
		rollupOptions: {
			output: {
				manualChunks: getManualChunk
			}
		}
	}
});
