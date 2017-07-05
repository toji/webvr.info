// Copyright 2017 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

class WebVRScene {
  constructor() {
    this._gl = null;

    this._timestamp = performance.now();
    this._statsEnabled = true;
    this._stats = null;
    this._statsMat = mat4.create();

    this.textureLoader = null;
  }

  setWebGLContext(gl) {
    this._gl = gl;

    if (gl) {
      if (this._statsEnabled) {
        this._stats = new WGLUStats(gl);
      }
      this.textureLoader = new WGLUTextureLoader(gl);

      this.onLoadScene(gl);
    }
  }

  loseWebGLContext() {
    if (this._gl) {
      this._gl = null;
      this._stats = null;
      this.textureLoader = null;
    }
  }

  enableStats(enable) {
    if (enable == this._statsEnabled)
      return;

    this._statsEnabled = enable;

    if (enable && this.gl) {
      this._stats = new WGLUStats(this.gl);
    } else if (!enable) {
      this._stats = null;
    }
  }

  draw(projectionMat, viewMat) {
    if (!this._gl) {
      // Don't draw when we don't have a valid context
      return;
    }

    this.onDrawView(this._gl, this._timestamp, projectionMat, viewMat);

    if (this.stats) {
      this._onDrawStats(projectionMat, viewMat);
    }
  }

  startFrame() {
    this._timestamp = performance.now();
    if (this._stats) {
      this._stats.begin();
    }
  }

  endFrame() {
    if (this._stats) {
      this._stats.end();
    }
  }

  // Override to load scene resources on construction or context restore.
  onLoadScene(gl) {}

  // Override with custom scene rendering.
  onDrawView(gl, timestamp, projectionMat, viewMat) {}

  _onDrawStats(projectionMat, viewMat) {
    // To ensure that the FPS counter is visible in VR mode we have to
    // render it as part of the scene.
    mat4.fromTranslation(this.statsMat, [0, -0.3, -0.5]);
    mat4.scale(this.statsMat, this.statsMat, [0.3, 0.3, 0.3]);
    mat4.rotateX(this.statsMat, this.statsMat, -0.75);
    mat4.multiply(this.statsMat, viewMat, this.statsMat);
    this.stats.render(projectionMat, this.statsMat);
  }
}

const VRCubeSeaVS = `
  uniform mat4 projectionMat;
  uniform mat4 modelViewMat;
  uniform mat3 normalMat;
  attribute vec3 position;
  attribute vec2 texCoord;
  attribute vec3 normal;
  varying vec2 vTexCoord;
  varying vec3 vLight;

  const vec3 lightDir = vec3(0.75, 0.5, 1.0);
  const vec3 ambientColor = vec3(0.5, 0.5, 0.5);
  const vec3 lightColor = vec3(0.75, 0.75, 0.75);

  void main() {
    vec3 normalRotated = normalMat * normal;
    float lightFactor = max(dot(normalize(lightDir), normalRotated), 0.0);
    vLight = ambientColor + (lightColor * lightFactor);
    vTexCoord = texCoord;
    gl_Position = projectionMat * modelViewMat * vec4( position, 1.0 );
  }
`;

const VRCubeSeaFS = `
  precision mediump float;
  uniform sampler2D diffuse;
  varying vec2 vTexCoord;
  varying vec3 vLight;

  void main() {
    gl_FragColor = vec4(vLight, 1.0) * texture2D(diffuse, vTexCoord);
  }
`;

class WebVRCubeSeaScene extends WebVRScene {
  constructor(gridSize) {
    super();

    this.gridSize = gridSize ? gridSize : 10;

    this.normalMat = mat3.create();
    this.heroRotationMat = mat4.create();
    this.heroModelViewMat = mat4.create();
  }

  onLoadScene(gl) {
    this.texture = this.textureLoader.loadTexture("media/textures/cube-sea.png");

    this.program = new WGLUProgram(gl);
    this.program.attachShaderSource(VRCubeSeaVS, gl.VERTEX_SHADER);
    this.program.attachShaderSource(VRCubeSeaFS, gl.FRAGMENT_SHADER);
    this.program.bindAttribLocation({
      position: 0,
      texCoord: 1,
      normal: 2
    });
    this.program.link();

    let cubeVerts = [];
    let cubeIndices = [];

    let cubeScale = 1.0;

    // Build a single cube.
    function appendCube (x, y, z, size) {
      if (!x && !y && !z) {
        // Don't create a cube in the center.
        return;
      }

      if (!size) size = 0.2;
      if (cubeScale) size *= cubeScale;
      // Bottom
      let idx = cubeVerts.length / 8.0;
      cubeIndices.push(idx, idx + 1, idx + 2);
      cubeIndices.push(idx, idx + 2, idx + 3);

      //             X         Y         Z         U    V    NX    NY   NZ
      cubeVerts.push(x - size, y - size, z - size, 0.0, 1.0, 0.0, -1.0, 0.0);
      cubeVerts.push(x + size, y - size, z - size, 1.0, 1.0, 0.0, -1.0, 0.0);
      cubeVerts.push(x + size, y - size, z + size, 1.0, 0.0, 0.0, -1.0, 0.0);
      cubeVerts.push(x - size, y - size, z + size, 0.0, 0.0, 0.0, -1.0, 0.0);

      // Top
      idx = cubeVerts.length / 8.0;
      cubeIndices.push(idx, idx + 2, idx + 1);
      cubeIndices.push(idx, idx + 3, idx + 2);

      cubeVerts.push(x - size, y + size, z - size, 0.0, 0.0, 0.0, 1.0, 0.0);
      cubeVerts.push(x + size, y + size, z - size, 1.0, 0.0, 0.0, 1.0, 0.0);
      cubeVerts.push(x + size, y + size, z + size, 1.0, 1.0, 0.0, 1.0, 0.0);
      cubeVerts.push(x - size, y + size, z + size, 0.0, 1.0, 0.0, 1.0, 0.0);

      // Left
      idx = cubeVerts.length / 8.0;
      cubeIndices.push(idx, idx + 2, idx + 1);
      cubeIndices.push(idx, idx + 3, idx + 2);

      cubeVerts.push(x - size, y - size, z - size, 0.0, 1.0, -1.0, 0.0, 0.0);
      cubeVerts.push(x - size, y + size, z - size, 0.0, 0.0, -1.0, 0.0, 0.0);
      cubeVerts.push(x - size, y + size, z + size, 1.0, 0.0, -1.0, 0.0, 0.0);
      cubeVerts.push(x - size, y - size, z + size, 1.0, 1.0, -1.0, 0.0, 0.0);

      // Right
      idx = cubeVerts.length / 8.0;
      cubeIndices.push(idx, idx + 1, idx + 2);
      cubeIndices.push(idx, idx + 2, idx + 3);

      cubeVerts.push(x + size, y - size, z - size, 1.0, 1.0, 1.0, 0.0, 0.0);
      cubeVerts.push(x + size, y + size, z - size, 1.0, 0.0, 1.0, 0.0, 0.0);
      cubeVerts.push(x + size, y + size, z + size, 0.0, 0.0, 1.0, 0.0, 0.0);
      cubeVerts.push(x + size, y - size, z + size, 0.0, 1.0, 1.0, 0.0, 0.0);

      // Back
      idx = cubeVerts.length / 8.0;
      cubeIndices.push(idx, idx + 2, idx + 1);
      cubeIndices.push(idx, idx + 3, idx + 2);

      cubeVerts.push(x - size, y - size, z - size, 1.0, 1.0, 0.0, 0.0, -1.0);
      cubeVerts.push(x + size, y - size, z - size, 0.0, 1.0, 0.0, 0.0, -1.0);
      cubeVerts.push(x + size, y + size, z - size, 0.0, 0.0, 0.0, 0.0, -1.0);
      cubeVerts.push(x - size, y + size, z - size, 1.0, 0.0, 0.0, 0.0, -1.0);

      // Front
      idx = cubeVerts.length / 8.0;
      cubeIndices.push(idx, idx + 1, idx + 2);
      cubeIndices.push(idx, idx + 2, idx + 3);

      cubeVerts.push(x - size, y - size, z + size, 0.0, 1.0, 0.0, 0.0, 1.0);
      cubeVerts.push(x + size, y - size, z + size, 1.0, 1.0, 0.0, 0.0, 1.0);
      cubeVerts.push(x + size, y + size, z + size, 1.0, 0.0, 0.0, 0.0, 1.0);
      cubeVerts.push(x - size, y + size, z + size, 0.0, 0.0, 0.0, 0.0, 1.0);
    }

    // Build the cube sea
    for (let x = 0; x < this.gridSize; ++x) {
      for (let y = 0; y < this.gridSize; ++y) {
        for (let z = 0; z < this.gridSize; ++z) {
          appendCube(x - (this.gridSize / 2),
                     y - (this.gridSize / 2),
                     z - (this.gridSize / 2));
        }
      }
    }

    this.indexCount = cubeIndices.length;

    // Add some "hero cubes" for separate animation.
    this.heroOffset = cubeIndices.length;
    appendCube(0, 0.25, -0.8, 0.05);
    appendCube(0.8, 0.25, 0, 0.05);
    appendCube(0, 0.25, 0.8, 0.05);
    appendCube(-0.8, 0.25, 0, 0.05);
    this.heroCount = cubeIndices.length - this.heroOffset;

    this.vertBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(cubeVerts), gl.STATIC_DRAW);

    this.indexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(cubeIndices), gl.STATIC_DRAW);
  }

  onDrawView(gl, timestamp, projectionMat, viewMat) {
    let program = this.program;

    program.use();

    gl.uniformMatrix4fv(program.uniform.projectionMat, false, projectionMat);
    gl.uniformMatrix4fv(program.uniform.modelViewMat, false, viewMat);
    mat3.identity(this.normalMat);
    gl.uniformMatrix3fv(program.uniform.normalMat, false, this.normalMat);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertBuffer);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);

    gl.enableVertexAttribArray(program.attrib.position);
    gl.enableVertexAttribArray(program.attrib.texCoord);
    gl.enableVertexAttribArray(program.attrib.normal);

    gl.vertexAttribPointer(program.attrib.position, 3, gl.FLOAT, false, 32, 0);
    gl.vertexAttribPointer(program.attrib.texCoord, 2, gl.FLOAT, false, 32, 12);
    gl.vertexAttribPointer(program.attrib.normal, 3, gl.FLOAT, false, 32, 20);

    gl.activeTexture(gl.TEXTURE0);
    gl.uniform1i(this.program.uniform.diffuse, 0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);

    gl.drawElements(gl.TRIANGLES, this.indexCount, gl.UNSIGNED_SHORT, 0);

    if (timestamp) {
      mat4.fromRotation(this.heroRotationMat, timestamp / 2000, [0, 1, 0]);
      mat4.multiply(this.heroModelViewMat, viewMat, this.heroRotationMat);
      gl.uniformMatrix4fv(program.uniform.modelViewMat, false, this.heroModelViewMat);

      // We know that the additional model matrix is a pure rotation,
      // so we can just use the non-position parts of the matrix
      // directly, this is cheaper than the transpose+inverse that
      // normalFromMat4 would do.
      mat3.fromMat4(this.normalMat, this.heroRotationMat);
      gl.uniformMatrix3fv(program.uniform.normalMat, false, this.normalMat);

      gl.drawElements(gl.TRIANGLES, this.heroCount, gl.UNSIGNED_SHORT, this.heroOffset * 2);
    }
  }
}
