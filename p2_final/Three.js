// 라이브러리가 HTML 상에서 글로벌(THREE)로 로드되므로 글로벌 객체에서 로더를 가져옵니다.
const FontLoader = THREE.FontLoader;
const TextGeometry = THREE.TextGeometry;

// 1. Scene & Camera 세팅
const scene = new THREE.Scene();
scene.background = new THREE.Color("#ffffff"); 

const container = document.getElementById('three-canvas-container') || document.body;

// 반응형 카메라 거리 조절을 위해 FOV 값을 고정 상수로 분리
const CAMERA_FOV = 38;
const camera = new THREE.PerspectiveCamera(
  CAMERA_FOV, 
  container.clientWidth / container.clientHeight,
  0.1,
  100
);

// 창 크기에 따라 초기 카메라 Z축 거리를 자동으로 계산해 주는 함수
function getResponsiveCameraZ() {
  const width = container.clientWidth;
  if (width < 600) return 24;
  if (width < 900) return 18;
  return 13;
}
camera.position.set(0, 0, getResponsiveCameraZ());

// 2. Renderer 세팅
const renderer = new THREE.WebGLRenderer({
  antialias: true,
  alpha: true
});
renderer.setSize(container.clientWidth, container.clientHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2; 
container.appendChild(renderer.domElement);

let ring;
let isDragging = false;
let previousMousePosition = { x: 0, y: 0 };

const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

let startMousePos = { x: 0, y: 0 };
let startTouchPos = { x: 0, y: 0 };
const CLICK_THRESHOLD = 5; 

let clickablePendants = [];

const targetLinks = [
  "",
  "shared-posters.html",
  "personal-poster.html",
  "../index.html" 
];

// 3. 조명 세팅
const keyLight = new THREE.DirectionalLight("#ffffff", 3);
keyLight.position.set(5, 8, 5);
scene.add(keyLight);

const fillLight = new THREE.PointLight("#ffffff", 2);
fillLight.position.set(-5, 3, 4);
scene.add(fillLight);

const pmremGenerator = new THREE.PMREMGenerator(renderer);
pmremGenerator.compileEquirectangularShader();
scene.environment = pmremGenerator.fromScene(new THREE.Scene()).texture;

// 4. 재질 정의
const chromeMaterial = new THREE.MeshPhysicalMaterial({
  color: "#ffffff",
  metalness: 0.9,
  roughness: 0.12,
  clearcoat: 1,
  clearcoatRoughness: 0.05
});

const pinkMaterial = new THREE.MeshStandardMaterial({
  color: "#d34aa0",
  roughness: 0.35,
  metalness: 0.1
});

// 5. 메인 큰 고리 생성
const ringRadius = 3.5;
const ringGeometry = new THREE.TorusGeometry(ringRadius, 0.1, 24, 100); 
ring = new THREE.Mesh(ringGeometry, chromeMaterial);
ring.rotation.set(0.3, -0.6, 0);
scene.add(ring);

const chainGeometry = new THREE.TorusGeometry(0.2, 0.06, 12, 32); 
const segmentsPerChain = 5; 
const segmentLength = 0.28; 

let chains = []; 
const GRAVITY = -0.015;  
const DAMPING = 0.80;    

const fontUrls = [ 
  "https://threejs.org/examples/fonts/gentilis_bold.typeface.json",   
  "https://threejs.org/examples/fonts/optimer_bold.typeface.json",
  "https://threejs.org/examples/fonts/helvetiker_bold.typeface.json",
  "https://threejs.org/examples/fonts/helvetiker_bold.typeface.json" 
];

const textConfigs = [
  { text: "Click a keyring to go into pages", isEllipse: false },
  { text: "Shared Posters", isEllipse: false },
  { text: "Personal Poster", isEllipse: true },
  { text: "PORTFOLIO", isEllipse: false, isSerif: true } 
];

const fontLoader = new FontLoader();

textConfigs.forEach((config, index) => {
  fontLoader.load(fontUrls[index], (font) => {
    const angle = (index / textConfigs.length) * Math.PI * 2;
    
    const localAttachPoint = new THREE.Vector3(
      Math.cos(angle) * ringRadius,
      Math.sin(angle) * ringRadius,
      0
    );

    ring.updateMatrixWorld();
    const worldAttachPoint = localAttachPoint.clone().applyMatrix4(ring.matrixWorld);

    let points = [];

    for (let i = 0; i < segmentsPerChain; i++) {
      const mesh = new THREE.Mesh(chainGeometry, chromeMaterial);
      scene.add(mesh);
      const pos = worldAttachPoint.clone().add(new THREE.Vector3(0, -(i + 1) * segmentLength, 0));
      points.push({ type: 'chain', mesh: mesh, position: pos.clone(), oldPosition: pos.clone(), index: i });
    }

    let pendantGroup = new THREE.Group();
    const textGeo = new TextGeometry(config.text, {
      font: font, size: 0.27, height: 0.08, curveSegments: 16,
      bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.01, bevelSegments: 4
    });
    textGeo.center();

    let currentPendantLength = 0.5;

    if (config.isEllipse) {
      const ellipseGeo = new THREE.CircleGeometry(1.0, 64);
      ellipseGeo.scale(1.5, 0.9, 1.0); 
      const ellipseMesh = new THREE.Mesh(ellipseGeo, new THREE.MeshStandardMaterial({
        color: "#000080", metalness: 0.0, roughness: 0.15, side: THREE.DoubleSide
      }));
      pendantGroup.add(ellipseMesh);
      const textMesh = new THREE.Mesh(textGeo, new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.3 }));
      textMesh.position.z = 0.1;
      pendantGroup.add(textMesh);
      currentPendantLength = 1.0;
    } else if (index === 1) {
      const tagBg = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.9, 0.1), pinkMaterial);
      pendantGroup.add(tagBg);
      const textMesh = new THREE.Mesh(textGeo, new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.2 }));
      textMesh.position.z = 0.08;
      pendantGroup.add(textMesh);
    } else {
      if (config.isSerif) {
        // PORTFOLIO: 민트색 직사각형 판넬 + 검정 글씨
        const tagBg = new THREE.Mesh(
          new THREE.BoxGeometry(3.0, 0.9, 0.1),
          new THREE.MeshStandardMaterial({ color: "#15f58d", roughness: 0.2 })
        );
        pendantGroup.add(tagBg);
        const textMesh = new THREE.Mesh(textGeo, new THREE.MeshStandardMaterial({ color: "#000000", roughness: 0.1 }));
        textMesh.position.z = 0.08;
        pendantGroup.add(textMesh);
      } else {
        const connectionRing = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.03, 16, 48), chromeMaterial);
        connectionRing.position.y = 0.35;
        pendantGroup.add(connectionRing);
        const textMesh = new THREE.Mesh(textGeo, chromeMaterial);
        pendantGroup.add(textMesh);
      }
    }

    scene.add(pendantGroup);
    pendantGroup.userData = { linkIndex: index };
    clickablePendants.push(pendantGroup);

    const pendantPos = worldAttachPoint.clone().add(
      new THREE.Vector3(0, -(segmentsPerChain * segmentLength + currentPendantLength), 0)
    );
    points.push({ type: 'pendant', mesh: pendantGroup, position: pendantPos.clone(), oldPosition: pendantPos.clone() });
    chains.push({ localAttachPoint: localAttachPoint, points: points, segmentLength: segmentLength, pendantLength: currentPendantLength });
  });
});

// [기존 내용 동일] ... (중략) ...

// 6. 이벤트 및 애니메이션 루프
const dom = renderer.domElement;

// [추가된 부분] 창 크기 조절 시 왜곡 방지 및 비율 유지 로직
window.addEventListener("resize", () => {
  const width = container.clientWidth;
  const height = container.clientHeight;

  // 카메라 비율 갱신 및 투영 행렬 업데이트 (왜곡 방지 핵심)
  camera.aspect = width / height;
  camera.updateProjectionMatrix();

  // 반응형 카메라 거리 조절
  camera.position.z = getResponsiveCameraZ();

  // 렌더러 크기 갱신
  renderer.setSize(width, height);
});

// 마우스/터치 인터랙션
dom.addEventListener('mousedown', (e) => { 
  isDragging = true; 
  previousMousePosition = { x: e.clientX, y: e.clientY }; 
  startMousePos = { x: e.clientX, y: e.clientY }; 
});

dom.addEventListener('mousemove', (e) => {
  const rect = dom.getBoundingClientRect();
  mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  
  if (!isDragging) {
    raycaster.setFromCamera(mouse, camera);
    dom.style.cursor = raycaster.intersectObjects(clickablePendants, true).length > 0 ? 'pointer' : 'default';
  } else {
    dom.style.cursor = 'grabbing';
    const deltaMove = { x: e.clientX - previousMousePosition.x, y: e.clientY - previousMousePosition.y };
    const deltaRotationQuaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(deltaMove.y * 0.005, deltaMove.x * 0.005, 0, 'XYZ'));
    ring.quaternion.multiplyQuaternions(deltaRotationQuaternion, ring.quaternion);
    previousMousePosition = { x: e.clientX, y: e.clientY };
  }
});

window.addEventListener('mouseup', (e) => {
  isDragging = false; 
  dom.style.cursor = 'default';
  if (Math.abs(e.clientX - startMousePos.x) < CLICK_THRESHOLD && Math.abs(e.clientY - startMousePos.y) < CLICK_THRESHOLD) {
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(clickablePendants, true);
    if (intersects.length > 0) {
      let target = intersects[0].object;
      while (target.parent && !clickablePendants.includes(target)) target = target.parent;
      if (clickablePendants.includes(target) && targetLinks[target.userData.linkIndex]) window.location.href = targetLinks[target.userData.linkIndex];
    }
  }
});

function animate() {
  requestAnimationFrame(animate);
  if (ring) {
    ring.updateMatrixWorld();
    chains.forEach(chain => {
      const currentWorldAttachPoint = chain.localAttachPoint.clone().applyMatrix4(ring.matrixWorld);
      chain.points.forEach(p => {
        const velocity = p.position.clone().sub(p.oldPosition).multiplyScalar(DAMPING);
        p.oldPosition.copy(p.position);
        p.position.add(velocity);
        p.position.y += GRAVITY;
      });
      for (let sim = 0; sim < 3; sim++) {
        chain.points.forEach((p, i) => {
          if (i === 0) { const dir = p.position.clone().sub(currentWorldAttachPoint).normalize(); p.position.copy(currentWorldAttachPoint.clone().add(dir.multiplyScalar(chain.segmentLength))); }
          else { const prevP = chain.points[i - 1]; const dir = p.position.clone().sub(prevP.position).normalize(); p.position.copy(prevP.position.clone().add(dir.multiplyScalar((p.type === 'pendant') ? chain.pendantLength : chain.segmentLength))); }
        });
      }
      chain.points.forEach((p, i) => {
        p.mesh.position.copy(p.position);
        if (p.type === 'chain') { p.mesh.lookAt(i === 0 ? currentWorldAttachPoint : chain.points[i - 1].position); p.mesh.rotateX(Math.PI / 2); if (p.index % 2 === 0) p.mesh.rotateY(Math.PI / 2); }
        else { p.mesh.lookAt(p.mesh.position.clone().add(new THREE.Vector3(0, 0, 1))); }
      });
    });
  }
  renderer.render(scene, camera);
}
animate();