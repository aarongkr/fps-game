import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import RAPIER from '@dimforge/rapier3d-compat';

async function init() {
  // --- Init THREE.js ---
  let gravityMult = 10;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
  camera.position.set(0, 1.5, 0);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  document.body.appendChild(renderer.domElement);

  // --- Lighting ---
  const sun = new THREE.DirectionalLight(0xffffff, 2);
  sun.position.set(30, 50, -20);
  sun.castShadow = true;
  sun.shadow.mapSize.width = 2048;
  sun.shadow.mapSize.height = 2048;
  sun.shadow.camera.near = 0.5;
  sun.shadow.camera.far = 200;
  sun.shadow.camera.left = -50;
  sun.shadow.camera.right = 50;
  sun.shadow.camera.top = 50;
  sun.shadow.camera.bottom = -50;
  scene.add(sun);

  const ambient = new THREE.AmbientLight(0x666688, 3);
  scene.add(ambient);
  sun.intensity = 3.25;

  // --- Sky ---
  const skyGeo = new THREE.SphereGeometry(200, 32, 32);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    uniforms: {
      topColor: { value: new THREE.Color(0x87ceeb) },
      bottomColor: { value: new THREE.Color(0xffffff) },
      offset: { value: 400 },
      exponent: { value: 0.6 }
    },
    vertexShader: `
      varying vec3 vWorldPosition;
      void main() {
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPosition.xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 topColor;
      uniform vec3 bottomColor;
      uniform float offset;
      uniform float exponent;
      varying vec3 vWorldPosition;
      void main() {
        float h = normalize(vWorldPosition + offset).y;
        gl_FragColor = vec4(mix(bottomColor, topColor, max(pow(max(h, 0.0), exponent), 0.0)), 1.0);
      }
    `
  });
  const sky = new THREE.Mesh(skyGeo, skyMat);
  scene.add(sky);

  // --- Init RAPIER ---
  await RAPIER.init();
  const world = new RAPIER.World({ x: 0, y: -9.81*gravityMult, z: 0 });
  const feetOffset = 0.05;

  // --- Obstacles ---
  function addObstacle(x, y, z, w, h, d, color = 0x888888) {
    const geo = new THREE.BoxGeometry(w, h, d);
    const mat = new THREE.MeshStandardMaterial({ color });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y + h / 2, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);

    const body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(w / 2, h / 2 + feetOffset, d / 2),
      body
    );
    body.setTranslation({ x, y: y + h / 2, z });
  }

  // --- Add Model ---
  function addModel({
    path, x = 0, y = 0, z = 0, scale = 1,
    collider = null, //"box", "cylinder"
    dynamic = true, yOffset = 0,
    colliderX = 1, colliderY = 1, colliderZ = 1,
    material = null, //"wood", "metal", "stone"
    lockRotation = false
  }) {
    const loader = new GLTFLoader();
    loader.load(path, (gltf) => {
      const model = gltf.scene;
      model.traverse((child) => {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });
      model.scale.set(scale, scale, scale);
      model.position.set(0, 0, 0);
      scene.add(model);

      const bodyDesc = dynamic
        ? RAPIER.RigidBodyDesc.dynamic().setTranslation(x, y, z)
        : RAPIER.RigidBodyDesc.fixed().setTranslation(x, y, z);

      if (lockRotation) bodyDesc.lockRotations();

      const body = world.createRigidBody(bodyDesc);

      let colliderDesc;
      if (collider === "box") colliderDesc = RAPIER.ColliderDesc.cuboid(colliderX, colliderY, colliderZ);
      else if (collider === "cylinder") colliderDesc = RAPIER.ColliderDesc.cylinder(colliderX, colliderY);
      else colliderDesc = RAPIER.ColliderDesc.cuboid(colliderX, colliderY, colliderZ);

      if (material == "wood") colliderDesc.setDensity(5);
      else if (material == "metal") colliderDesc.setDensity(6);
      else if (material == "stone") colliderDesc.setDensity(8);

      world.createCollider(colliderDesc, body);

      function updateModel() {
        const pos = body.translation();
        const rot = body.rotation();
        model.position.set(pos.x, pos.y + yOffset, pos.z);
        model.quaternion.set(rot.x, rot.y, rot.z, rot.w);
        requestAnimationFrame(updateModel);
      }
      updateModel();
    });
  };

  // --- Models ---
  function barrel({ x = 0, y = 0, z = 0 }) {
    addModel({ path: '/models/Barrel.glb', x, y, z, scale: 8, collider: 'cylinder', dynamic: true, yOffset: -0.7, colliderX: 0.8, colliderY: 0.5, material: "wood" });
  }

  function smallCrate({ x = 0, y = 0, z = 0 }) {
    addModel({ path: '/models/Crate.glb', x, y, z, scale: 5, collider: 'box', dynamic: true, yOffset: -0.25, colliderX: 0.35, colliderY: 0.4, colliderZ: 0.35, material: "wood", lockRotation: true });
  }

  function metalCrate({ x = 0, y = 0, z = 0 }) {
    addModel({ path: '/models/Crate.glb', x, y, z, scale: 5, collider: 'box', dynamic: true, yOffset: -0.25, colliderX: 0.35, colliderY: 0.4, colliderZ: 0.35, material: "metal", lockRotation: true });
  }

  function bigCrate({ x = 0, y = 0, z = 0 }) {
    addModel({ path: '/models/Crate.glb', x, y, z, scale: 10, collider: 'box', dynamic: true, yOffset: -0.5, colliderX: 0.7, colliderY: 0.7, colliderZ: 0.7, material: "wood" });
  }

  // Floor
  let floorSize = 50;
  for (let i = -floorSize; i < floorSize; i += 4) {
    for (let j = -floorSize; j < floorSize; j += 4) {
      addModel({ path: '/models/Floor Tile.glb', x: i, y: 0, z: j, scale: 2, collider: 'box', dynamic: false, colliderX: 4, colliderY: 0.1, colliderZ: 4 });
    }
  }

  metalCrate({ x: 5, y: 5, z: 0 });
  smallCrate({ x: 5, y: 10, z: 0 });
  barrel({ x: 2, y: 5, z: -5 });
  bigCrate({ x: 4, y: 10, z: 5 });

  // --- Player Capsule (dynamic, rotation-locked) ---
  const capsuleHeight = 1.0;
  const capsuleRadius = 0.5;
  const playerStartY = capsuleHeight / 2 + 5;
  const playerBody = world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic().setTranslation(0, playerStartY, 0).lockRotations(true, true, true)
  );

  let playerCollider = world.createCollider(RAPIER.ColliderDesc.capsule(capsuleHeight / 2, capsuleRadius), playerBody);

  const capsuleGeo = new THREE.CapsuleGeometry(capsuleRadius, capsuleHeight, 8, 16);
  const capsuleMat = new THREE.MeshStandardMaterial({ color: 0x44aa88, wireframe: true });
  const playerMesh = new THREE.Mesh(capsuleGeo, capsuleMat);
  playerMesh.castShadow = true;
  scene.add(playerMesh);
  let showPlayerMesh = true;

  // --- Input ---
  const keys = { w: false, a: false, s: false, d: false, ' ': false, shift: false, q: false };
  let useThirdPerson = false;
  const normalHeight = 1.0, crouchHeight = 0.5;
  let isCrouched = false, crouchToggleReady = true;
  let jumpStrength = 20, walkSpeed = 15, crouchSpeed = 5, sprintMultiplier = 1.5, isSprinting = false;
  let dashTime = 0, dashDuration = 15, dashSpeed = 50;
  let dashDirection = new THREE.Vector3();

  document.addEventListener('keydown', (e) => {
    if (e.code === "Space") keys[' '] = true;
    if (e.code === "ShiftLeft" || e.code === "ShiftRight") keys.shift = true;
    if (e.code === "KeyQ") keys.q = true;
    if (e.code === "KeyV") { showPlayerMesh = !showPlayerMesh; playerMesh.visible = showPlayerMesh; }
    if (e.code === "KeyT") useThirdPerson = !useThirdPerson;

    if (e.code === "KeyZ" && crouchToggleReady) {
      isCrouched = !isCrouched;
      world.removeCollider(playerCollider, true);
      const newHeight = isCrouched ? crouchHeight / 2 : normalHeight / 2;
      playerCollider = world.createCollider(RAPIER.ColliderDesc.capsule(newHeight, capsuleRadius), playerBody);
      crouchToggleReady = false;
      jumpStrength = isCrouched ? 10 : 20;
    }

    if (keys[e.key.toLowerCase()] !== undefined) keys[e.key.toLowerCase()] = true;
  });

  document.addEventListener('keyup', (e) => {
    if (e.code === "Space") keys[' '] = false;
    if (e.code === "ShiftLeft" || e.code === "ShiftRight") keys.shift = false;
    if (e.code === "KeyQ") keys.q = false;
    if (e.code === "KeyZ") crouchToggleReady = true;
    if (keys[e.key.toLowerCase()] !== undefined) keys[e.key.toLowerCase()] = false;
  });

  // Mouse look
  let yaw = 0, pitch = 0;
  document.body.addEventListener('click', () => document.body.requestPointerLock());
  document.addEventListener('mousemove', (e) => {
    if (document.pointerLockElement === document.body) {
      yaw -= e.movementX * 0.002;
      pitch -= e.movementY * 0.002;
      pitch = Math.max(-Math.PI/2, Math.min(Math.PI/2, pitch));
    }
  });

  const shakeOffset = new THREE.Vector3(0, 0, 0);
  let headBobTime = 0;
  const thirdPersonOffset = new THREE.Vector3(0, 2, 5);

  // --- Animation loop ---
  function animate() {
    requestAnimationFrame(animate);

    // --- Movement ---
    let moveDir = new THREE.Vector3();
    if (keys.w) moveDir.z -= 1;
    if (keys.s) moveDir.z += 1;
    if (keys.a) moveDir.x -= 1;
    if (keys.d) moveDir.x += 1;
    moveDir.normalize().applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);

    isSprinting = keys.shift && !isCrouched;
    let speed = isCrouched ? crouchSpeed : (isSprinting ? walkSpeed * sprintMultiplier : walkSpeed);

    if (keys.q && dashTime <= 0 && moveDir.length() > 0) {
      dashDirection.copy(moveDir).normalize();
      dashTime = dashDuration;
      keys.q = false;
    }

    let dashVelocity = new THREE.Vector3();
    if (dashTime > 0) {
      dashVelocity.copy(dashDirection).multiplyScalar(dashSpeed);
      dashTime--;
    }

    // Apply linear velocity
    const currentVel = playerBody.linvel();
    const desiredVel = new RAPIER.Vector3(moveDir.x * speed + dashVelocity.x, currentVel.y, moveDir.z * speed + dashVelocity.z);
    playerBody.setLinvel(desiredVel, true);

    // Jump
    if (keys[' '] && Math.abs(currentVel.y) < 0.01) { // simple grounded check
      playerBody.setLinvel({ x: desiredVel.x, y: jumpStrength, z: desiredVel.z }, true);
    }

    // Sync mesh
    const pos = playerBody.translation();
    playerMesh.position.set(pos.x, pos.y, pos.z);

    // --- Camera ---
    if (useThirdPerson) {
      const targetPos = new THREE.Vector3().copy(playerBody.translation())
        .add(thirdPersonOffset.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw));
      camera.position.lerp(targetPos, 0.1);
      camera.lookAt(playerBody.translation().x, playerBody.translation().y + 1, playerBody.translation().z);
    } else {
      const camHeight = isCrouched ? 1.0 : 1.5;
      if (moveDir.length() > 0 && Math.abs(currentVel.y) < 0.01) {
        headBobTime += 0.2;
        let amplitude = 0.5, frequency = 0.3;
        if (isSprinting) { amplitude = 0.65; frequency = 0.4; }
        else if (isCrouched) { amplitude = 0.35; frequency = 0.1; }
        const bobY = Math.sin(headBobTime * frequency * Math.PI * 2) * amplitude;
        const bobX = Math.sin(headBobTime * frequency * Math.PI) * amplitude * 0.5;
        shakeOffset.x = THREE.MathUtils.lerp(shakeOffset.x, bobX, 0.1);
        shakeOffset.y = THREE.MathUtils.lerp(shakeOffset.y, bobY, 0.1);
      } else {
        shakeOffset.x = THREE.MathUtils.lerp(shakeOffset.x, 0, 0.1);
        shakeOffset.y = THREE.MathUtils.lerp(shakeOffset.y, 0, 0.1);
        headBobTime = 0;
      }
      // Camera roll on strafing
      let targetRoll = 0;
      if (keys.a) targetRoll = 0.03;
      else if (keys.d) targetRoll = -0.03;
      camera.rotation.z = THREE.MathUtils.lerp(camera.rotation.z, targetRoll, 0.1);

      // Dash tilt
      if (dashTime > 0) {
        const tiltAngle = dashDirection.x * 0.1;
        camera.rotation.z = THREE.MathUtils.lerp(camera.rotation.z, tiltAngle, 0.2);
      }
      camera.position.set(pos.x + shakeOffset.x, pos.y + camHeight + shakeOffset.y, pos.z);
      camera.rotation.order = "YXZ";
      camera.rotation.y = yaw;
      camera.rotation.x = pitch;
    }

    world.step();
    renderer.render(scene, camera);
  }
  animate();

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
}

init();
