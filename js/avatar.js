const THREE = window.THREE;

export function createAvatar(state, onFrame) {
  let sleepLerp = 0;
  const sleepSpeed = 0.02;
  let talkingSwayTime = 0,
    blinkPhase = Math.PI,
    blinkTimer = 0;
  let isNodding = false,
    nodTime = 0,
    sleepNodTime = 0;
  let isSmiling = false,
    idleSmileTime = 0;
  let isLookingAround = false,
    lookTime = 0,
    lookDirection = 0,
    lookTimer = 0;

  // === THREE.JS SETUP ===
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x111111);
  const camera = new THREE.PerspectiveCamera(
    45,
    innerWidth / innerHeight,
    0.1,
    100
  );
  camera.position.set(0.4, 0.2, 0.8);
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(innerWidth, innerHeight);
  renderer.setPixelRatio(devicePixelRatio);
  document.body.appendChild(renderer.domElement);
  const controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;

  const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
  const dirLight1 = new THREE.DirectionalLight(0xffffff, 1);
  dirLight1.position.set(5, 10, 7);
  const dirLight2 = new THREE.DirectionalLight(0xffeedd, 0.5);
  dirLight2.position.set(-5, 5, -5);
  scene.add(ambientLight, dirLight1, dirLight2);

  let headMesh, morphDict, headGroup, glowMesh;
  let mouthTargets = null;
  let previousFrame = performance.now();
  const originalColor = new THREE.Color(0xa0e0a0);
  const greyColor = new THREE.Color(0x888888);

  const loader = new THREE.GLTFLoader();
  const ready = new Promise((resolve, reject) =>
    loader.load(
      "./models/holly.glb",
      (gltf) => {
        const root = gltf.scene;
        const box = new THREE.Box3().setFromObject(root);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        root.position.copy(center).multiplyScalar(-1);
        root.position.y += size.y * 0.1;
        root.scale.multiplyScalar(0.8 / Math.max(size.x, size.y, size.z));
        headGroup = new THREE.Group();
        headGroup.add(root);
        scene.add(headGroup);

        root.traverse((child) => {
          if (child.isMesh) {
            headMesh = child;
            morphDict = child.morphTargetDictionary;
            if (child.material && !child.material.map) {
              child.material.color.copy(originalColor);
              child.material.roughness = 0.5;
              child.material.metalness = 0.05;
            }
            child.material.side = THREE.DoubleSide;
            const glowGeometry = child.geometry.clone();
            const glowMaterial = new THREE.MeshBasicMaterial({
              color: 0x88ffaa,
              transparent: true,
              opacity: 0.25,
              blending: THREE.AdditiveBlending,
              side: THREE.BackSide,
            });
            glowMesh = new THREE.Mesh(glowGeometry, glowMaterial);
            glowMesh.scale.multiplyScalar(1.15);
            headGroup.add(glowMesh);
          }
        });
        controls.update();
        resolve();
      },
      undefined,
      reject
    )
  );

  function animate() {
    requestAnimationFrame(animate);
    const now = performance.now();
    const frameSeconds = Math.min((now - previousFrame) / 1000, 0.1);
    previousFrame = now;
    controls.update();

    const shouldSleep =
      !state.isListening || (!state.talkingMode && state.isListening);
    const targetSleep = shouldSleep ? 1 : 0;
    sleepLerp += (targetSleep - sleepLerp) * sleepSpeed;

    if (headMesh && morphDict && headGroup) {
      // Color & lighting
      headMesh.material.color.lerpColors(originalColor, greyColor, sleepLerp);
      ambientLight.intensity = 0.8 - 0.5 * sleepLerp;
      dirLight1.intensity = 1.0 - 0.7 * sleepLerp;
      dirLight2.intensity = 0.5 - 0.3 * sleepLerp;

      // Glow
      if (glowMesh) {
        const awakeAmount = 1 - sleepLerp;
        glowMesh.material.opacity =
          0.25 * awakeAmount * (state.talking ? 1.4 : 1.0);
        glowMesh.visible = awakeAmount > 0.1;
      }

      // Eyes close fully when asleep
      if (
        morphDict.EyeBlink_L !== undefined &&
        morphDict.EyeBlink_R !== undefined
      ) {
        const eyeClose = sleepLerp;
        headMesh.morphTargetInfluences[morphDict.EyeBlink_L] = eyeClose;
        headMesh.morphTargetInfluences[morphDict.EyeBlink_R] = eyeClose;
      }

      // Morph decay
      const decay = {
        pp: 0.78,
        ff: 0.8,
        ss: 0.83,
        TH: 0.84,
        CH: 0.86,
        AA: 0.93,
        EE: 0.92,
        IH: 0.92,
        OH: 0.94,
        OU: 0.93,
        JawOpen: 0.91,
      };
      Object.keys(decay).forEach((name) => {
        const index = morphDict[name];
        if (index === undefined) return;
        if (mouthTargets) {
          const current = headMesh.morphTargetInfluences[index];
          const target = mouthTargets[name] || 0;
          const seconds = target > current ? 0.1 : 0.16;
          const blend = 1 - Math.exp(-frameSeconds / seconds);
          headMesh.morphTargetInfluences[index] = current + (target - current) * blend;
        } else {
          headMesh.morphTargetInfluences[index] *= decay[name];
        }
      });

      // Talking sway
      if (state.talking) {
        talkingSwayTime += 0.008;
        headGroup.rotation.y = Math.sin(talkingSwayTime) * 0.08;
      }

      // Nodding / Sleep nod
      if (isNodding) {
        nodTime += 0.016;
        headGroup.rotation.x = Math.sin(nodTime * 10) * 0.06;
        if (nodTime > Math.PI / 5) isNodding = false;
      } else if (!state.talking && sleepLerp > 0.8) {
        sleepNodTime += 0.016;
        headGroup.rotation.x = Math.sin(sleepNodTime * 2) * 0.06; // subtle sleep nod
      } else if (!state.talking) {
        headGroup.rotation.x *= 0.96;
      }

      if (sleepLerp >= 0.8) {
        ["smile", "MouthSmile_L", "MouthSmile_R"].forEach((name) => {
          const index = morphDict[name];
          if (index !== undefined) headMesh.morphTargetInfluences[index] *= 0.9;
        });
      }
      // Only do blinking, smiling, and looking around if awake
      if (sleepLerp < 0.8) {
        // Looking around
        lookTimer += 0.016;
        if (
          !isLookingAround &&
          !state.talking &&
          lookTimer > 10 + Math.random() * 15
        ) {
          isLookingAround = true;
          lookTime = 0;
          lookDirection = Math.random() < 0.5 ? -1 : 1;
          lookTimer = 0;
        }
        if (isLookingAround && !state.talking) {
          lookTime += 0.016;
          headGroup.rotation.y =
            Math.sin(lookTime * 1.5) * 0.17 * lookDirection;
          if (lookTime > 4.5) isLookingAround = false;
        } else if (!state.talking) {
          headGroup.rotation.y *= 0.95;
        }

        // Idle smile
        idleSmileTime += 0.016;
        if (!isSmiling && idleSmileTime > 8 + Math.random() * 8) {
          isSmiling = true;
          idleSmileTime = 0;
        }
        if (isSmiling) {
          ["smile", "MouthSmile_L", "MouthSmile_R"].forEach((m) => {
            if (morphDict[m])
              headMesh.morphTargetInfluences[morphDict[m]] = Math.min(
                0.4,
                (headMesh.morphTargetInfluences[morphDict[m]] || 0) + 0.02
              );
          });
          if (idleSmileTime > 2.5 + Math.random() * 2) {
            isSmiling = false;
            idleSmileTime = 0;
          }
        } else {
          ["smile", "MouthSmile_L", "MouthSmile_R"].forEach(
            (m) =>
              morphDict[m] !== undefined &&
              (headMesh.morphTargetInfluences[morphDict[m]] *= 0.95)
          );
        }

        // Smooth blinking
        const interval = state.talking
          ? 3 + Math.random() * 3
          : 5 + Math.random() * 7;
        blinkTimer += 0.016;
        if (blinkTimer > interval) {
          blinkPhase = 0;
          blinkTimer = 0;
        }
        if (blinkPhase < Math.PI) {
          const blinkAmount = Math.sin(blinkPhase);
          ["EyeBlink_L", "EyeBlink_R"].forEach((e) => {
            if (morphDict[e] !== undefined)
              headMesh.morphTargetInfluences[morphDict[e]] = blinkAmount;
          });
          blinkPhase += 0.16;
        } else {
          ["EyeBlink_L", "EyeBlink_R"].forEach((e) => {
            if (morphDict[e] !== undefined)
              headMesh.morphTargetInfluences[morphDict[e]] *= 0.9;
          });
        }
      }
    }

    onFrame(sleepLerp);
    renderer.render(scene, camera);
  }
  animate();

  // --- RESIZE ---
  window.addEventListener("resize", () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  });

  function resetMouth() {
    mouthTargets = null;
    const names = [
      "AA",
      "EE",
      "IH",
      "OH",
      "OU",
      "ff",
      "pp",
      "TH",
      "ss",
      "CH",
      "JawOpen",
    ];
    names.forEach((name) => {
      const index = morphDict?.[name];
      if (index !== undefined) headMesh.morphTargetInfluences[index] = 0;
    });
  }

  function startTalking() {
    resetMouth();
    headGroup.rotation.set(0, 0, 0);
    talkingSwayTime = 0;
  }

  function animateWord(word, { smooth = false, strength = 1 } = {}) {
    mouthTargets = smooth ? {} : null;
    const shapes = [
      [/[aeiouy]/, "AA", 0.7],
      [/[bfpvm]/, "pp", 0.8],
      [/f/, "ff", 0.8],
      [/s/, "ss", 0.7],
      [/ch|sh/, "CH", 0.65],
      [/th/, "TH", 0.75],
    ];
    shapes.forEach(([pattern, name, amount]) => {
      const index = morphDict?.[name];
      if (index !== undefined && pattern.test(word)) {
        if (smooth) mouthTargets[name] = amount * strength;
        else headMesh.morphTargetInfluences[index] = amount;
      }
    });
    if (word && Math.random() < 0.08) {
      isNodding = true;
      nodTime = 0;
    }
  }

  return {
    ready,
    canvas: renderer.domElement,
    resetMouth,
    startTalking,
    animateWord,
  };
}
