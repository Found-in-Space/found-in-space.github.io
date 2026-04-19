import { HRDiagramRenderer as BaseHRDiagramRenderer } from '@found-in-space/skykit';

const MODE_1_OLD_BLOCK = `        // ── Mode 1: volume-complete (show every star in the geometry) ───
        else if (uMode == 1) {
          vAlpha = 0.5;
        }`;

const MODE_1_NEW_BLOCK = `        // ── Mode 1: volume-complete (GPU filters the geometry by observer distance) ───
        else if (uMode == 1) {
          float d   = length(worldPos - uCameraPosition);
          float dPc = max(d / uScale, 0.001);
          if (dPc > uVolumeRadiusPc) {
            gl_Position = vec4(2.0, 2.0, 0.0, 1.0);
            gl_PointSize = 0.0;
            vAlpha = 0.0;
            return;
          }
          vAlpha = 0.5;
        }`;

function patchVolumeShader(material, volumeRadiusPc) {
	if (!material || material.userData?.fisVolumeRadiusPatchApplied) {
		if (material?.uniforms?.uVolumeRadiusPc) {
			material.uniforms.uVolumeRadiusPc.value = volumeRadiusPc;
		}
		return;
	}

	material.uniforms.uVolumeRadiusPc ??= { value: volumeRadiusPc };

	if (
		typeof material.vertexShader === 'string'
		&& !material.vertexShader.includes('uVolumeRadiusPc')
	) {
		material.vertexShader = material.vertexShader.replace(
			'uniform float uMagLimit;\n',
			'uniform float uMagLimit;\n      uniform float uVolumeRadiusPc;\n',
		);
	}

	if (
		typeof material.vertexShader === 'string'
		&& material.vertexShader.includes(MODE_1_OLD_BLOCK)
	) {
		material.vertexShader = material.vertexShader.replace(
			MODE_1_OLD_BLOCK,
			MODE_1_NEW_BLOCK,
		);
	}

	material.userData = {
		...(material.userData ?? {}),
		fisVolumeRadiusPatchApplied: true,
	};
	material.needsUpdate = true;
}

export class HRDiagramRenderer extends BaseHRDiagramRenderer {
	constructor(hostCanvas, options = {}) {
		super(hostCanvas, options);
		this.volumeRadiusPc = options.volumeRadiusPc ?? 25;
		patchVolumeShader(this.hrMaterial, this.volumeRadiusPc);
		this.setVolumeRadiusPc(this.volumeRadiusPc);
	}

	setVolumeRadiusPc(radiusPc) {
		this.volumeRadiusPc = radiusPc;
		if (!this.hrMaterial?.uniforms) {
			return;
		}
		patchVolumeShader(this.hrMaterial, radiusPc);
		this.hrMaterial.uniforms.uVolumeRadiusPc.value = radiusPc;
	}
}
