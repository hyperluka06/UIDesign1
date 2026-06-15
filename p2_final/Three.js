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
  if (width < 600) {
    return 24; // 모바일 세로 화면 등 아주 좁은 창
  } else if (width < 900) {
    return 18; // 태블릿이나 애매한 창 크기
  } else {
    return 13; // 충분히 넓은 기본 데스크톱 화면
  }
}
camera.position.set(0, 0, getResponsiveCameraZ()); 

// 2. Renderer 세팅 (시네마틱 톤매핑 옵션 적용)
const renderer = new THREE.WebGLRenderer({
  antialias: true,
  alpha: true
});
renderer.setSize(container.clientWidth, container.clientHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2; 
container.appendChild(renderer.domElement);

// 인터랙션 제어 및 레이캐스터 변수 세팅
let ring;
let isDragging = false;
let previousMousePosition = { x: 0, y: 0 };

const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

// 클릭 판정용 변수 (단순 드래그 회전과 클릭을 분리하기 위함)
let startMousePos = { x: 0, y: 0 };
let startTouchPos = { x: 0, y: 0 };
const CLICK_THRESHOLD = 5; // 마우스를 누르고 뗀 거리가 5px 미만일 때만 클릭으로 인정

// 레이캐스터 감지 대상인 펜던트 그룹들을 담을 배열
let clickablePendants = [];

// 각 텍스트(펜던트) 순서대로 이동할 HTML 파일 경로를 적어주세요.
const targetLinks = [
  "",   // 1번: Find in COPO 펜던트 클릭 시 이동할 HTML
  "shared-posters.html", // 2번: Shared Posters 펜던트 클릭 시 이동할 HTML
  "personal-poster.html" // 3번: Personal Poster 펜던트 클릭 시 이동할 HTML
];

// 3. 조명 세팅 (부드러운 스튜디오 조명)
const keyLight = new THREE.DirectionalLight("#ffffff", 3);
keyLight.position.set(5, 8, 5);
scene.add(keyLight);

const fillLight = new THREE.PointLight("#ffffff", 2);
fillLight.position.set(-5, 3, 4);
scene.add(fillLight);

// 기본 환경광 매핑 (금속 반사광 유도)
const pmremGenerator = new THREE.PMREMGenerator(renderer);
pmremGenerator.compileEquirectangularShader();
scene.environment = pmremGenerator.fromScene(new THREE.Scene()).texture;

// 4. 고급 재질 라인업 (입체 크롬 메탈 및 아크릴)
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

// 5. 메인 큰 고리(Keyring Base) 생성 (반지름 3.5 축소본 유지)
const ringRadius = 3.5;
const ringGeometry = new THREE.TorusGeometry(ringRadius, 0.1, 24, 100); 
ring = new THREE.Mesh(ringGeometry, chromeMaterial);
ring.rotation.set(0.3, -0.6, 0);
scene.add(ring);

// 사슬 고리 크기 및 시뮬레이션 상수 세팅 (묵직한 움직임 유지)
const chainGeometry = new THREE.TorusGeometry(0.2, 0.06, 12, 32); 
const segmentsPerChain = 5; 
const segmentLength = 0.28; 

let chains = []; 
const GRAVITY = -0.015;  
const DAMPING = 0.80;    

// 6. 개별 폰트 로드 및 펜던트 조립을 위한 데이터 설정
const fontUrls = [ 
  "https://threejs.org/examples/fonts/gentilis_bold.typeface.json",   
  "https://threejs.org/examples/fonts/optimer_bold.typeface.json",
  "https://threejs.org/examples/fonts/helvetiker_bold.typeface.json"     
];

const textConfigs = [
  { text: "Click a keyring to go into pages", isEllipse: false },
  { text: "Shared Posters", isEllipse: false },
  { text: "Personal Poster", isEllipse: true }
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

    // 크롬 쇠사슬 마디 생성
    for (let i = 0; i < segmentsPerChain; i++) {
      const mesh = new THREE.Mesh(chainGeometry, chromeMaterial);
      scene.add(mesh);

      const pos = worldAttachPoint.clone().add(new THREE.Vector3(0, -(i + 1) * segmentLength, 0));

      points.push({
        type: 'chain',
        mesh: mesh,
        position: pos.clone(),
        oldPosition: pos.clone(),
        index: i
      });
    }

    // 펜던트 그룹화 및 3D 텍스트 개별 커스텀 세팅
    let pendantGroup = new THREE.Group();
    
    const textGeo = new TextGeometry(config.text, {
      font: font, 
      size: index === 0.9 ? 0.30 : 0.27,  
      height: 0.08,                     
      curveSegments: 16,
      bevelEnabled: true,
      bevelThickness: 0.02,
      bevelSize: 0.01,
      bevelSegments: 4
    });
    textGeo.center(); 

    let currentPendantLength = 0.5;

    if (config.isEllipse) {
      // 1번: 네이비 블루 아크릴 타원판 + 하얀색 글자
      const ellipseGeo = new THREE.CircleGeometry(1.0, 64);
      ellipseGeo.scale(1.5, 0.9, 1.0); 
      
      const ellipseMesh = new THREE.Mesh(ellipseGeo, new THREE.MeshStandardMaterial({
        color: "#000080", 
        metalness: 0.0,
        roughness: 0.15,
        side: THREE.DoubleSide
      }));
      pendantGroup.add(ellipseMesh);

      const whiteTextMaterial = new THREE.MeshStandardMaterial({
        color: "#ffffff",
        roughness: 0.3,
        metalness: 0.1
      });
      const textMesh = new THREE.Mesh(textGeo, whiteTextMaterial);
      textMesh.position.z = 0.1;
      pendantGroup.add(textMesh);
      
      currentPendantLength = 1.0;
    } else if (index === 1) {
      // 2번: 핑크 아크릴 판넬
      const tagBg = new THREE.Mesh(
        new THREE.BoxGeometry(3.0, 0.9, 0.1),
        pinkMaterial
      );
      pendantGroup.add(tagBg);

      const textMesh = new THREE.Mesh(textGeo, new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.2 }));
      textMesh.position.z = 0.08;
      pendantGroup.add(textMesh);
    } else {
      // 3번: 올-크롬 메탈 글자 단독 댕글링
      const connectionRing = new THREE.Mesh(
        new THREE.TorusGeometry(0.14, 0.03, 16, 48),
        chromeMaterial
      );
      connectionRing.position.y = 0.35;
      pendantGroup.add(connectionRing);

      const textMesh = new THREE.Mesh(textGeo, chromeMaterial);
      pendantGroup.add(textMesh);
    }

    scene.add(pendantGroup);

    // 고유 인덱스를 데이터에 심어 레이캐스터 검색과 URL을 매핑하고 감지 배열에 추가
    pendantGroup.userData = { linkIndex: index };
    clickablePendants.push(pendantGroup);

    const pendantPos = worldAttachPoint.clone().add(
      new THREE.Vector3(0, -(segmentsPerChain * segmentLength + currentPendantLength), 0)
    );

    points.push({
      type: 'pendant',
      mesh: pendantGroup,
      position: pendantPos.clone(),
      oldPosition: pendantPos.clone()
    });

    chains.push({
      localAttachPoint: localAttachPoint,
      points: points,
      segmentLength: segmentLength,
      pendantLength: currentPendantLength
    });
  });
});

// 7. 인터랙션 제어 (마우스 및 레이캐스팅 페이지 이동 통합)
const dom = renderer.domElement;

dom.addEventListener('mousedown', (e) => {
  isDragging = true;
  previousMousePosition = { x: e.clientX, y: e.clientY };
  startMousePos = { x: e.clientX, y: e.clientY }; // 클릭 시작점 기록
});

dom.addEventListener('mousemove', (e) => {
  // 캔버스 내 마우스의 상대적 NDC 좌표 업데이트 (-1 ~ +1)
  const rect = dom.getBoundingClientRect();
  mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

  // 💡 [추가] 마우스가 움직일 때 호버 레이캐스팅을 통한 커서 스타일(pointer) 변화 정의
  if (!isDragging) {
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(clickablePendants, true);
    
    if (intersects.length > 0) {
      dom.style.cursor = 'pointer'; // 펜던트 위에 있으면 커서를 손가락 모양으로 변경
    } else {
      dom.style.cursor = 'default'; // 벗어나면 원래대로 변경
    }
  } else {
    // 드래그 중일 때는 회전 시각화를 위해 grabbing 커서 유지 권장 (선택 사항)
    dom.style.cursor = 'grabbing';
    
    const deltaMove = { x: e.clientX - previousMousePosition.x, y: e.clientY - previousMousePosition.y };
    const deltaRotationQuaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(
      deltaMove.y * 0.005, 
      deltaMove.x * 0.005, 
      0, 
      'XYZ'
    ));
    ring.quaternion.multiplyQuaternions(deltaRotationQuaternion, ring.quaternion);
    previousMousePosition = { x: e.clientX, y: e.clientY };
  }
});

window.addEventListener('mouseup', (e) => {
  isDragging = false;
  dom.style.cursor = 'default';

  // 마우스를 뗀 시점에 드래그가 아닌 순수 '클릭'이었는지 판별
  const distX = Math.abs(e.clientX - startMousePos.x);
  const distY = Math.abs(e.clientY - startMousePos.y);

  if (distX < CLICK_THRESHOLD && distY < CLICK_THRESHOLD) {
    const rect = dom.getBoundingClientRect();
    mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(clickablePendants, true);

    if (intersects.length > 0) {
      // 광선에 부딪힌 하위 오브젝트의 최상위 부모 pendantGroup 찾기
      let targetGroup = intersects[0].object;
      while (targetGroup.parent && !clickablePendants.includes(targetGroup)) {
        targetGroup = targetGroup.parent;
      }

      if (clickablePendants.includes(targetGroup)) {
        const linkIndex = targetGroup.userData.linkIndex;
        const targetUrl = targetLinks[linkIndex];
        
        if (targetUrl) {
          window.location.href = targetUrl; // 현재 탭에서 이동
        }
      }
    }
  }
});

// 모바일 터치 대응 (인터랙션 및 페이지 이동)
dom.addEventListener('touchstart', (e) => {
  isDragging = true;
  previousMousePosition = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  startTouchPos = { x: e.touches[0].clientX, y: e.touches[0].clientY };
});

dom.addEventListener('touchmove', (e) => {
  if (!isDragging) return;
  const deltaMove = { x: e.touches[0].clientX - previousMousePosition.x, y: e.touches[0].clientY - previousMousePosition.y };
  const deltaRotationQuaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(
    deltaMove.y * 0.005, deltaMove.x * 0.005, 0, 'XYZ'
  ));
  ring.quaternion.multiplyQuaternions(deltaRotationQuaternion, ring.quaternion);
  previousMousePosition = { x: e.touches[0].clientX, y: e.touches[0].clientY };
});

window.addEventListener('touchend', (e) => {
  isDragging = false;
  
  if (e.changedTouches.length > 0) {
    const distX = Math.abs(e.changedTouches[0].clientX - startTouchPos.x);
    const distY = Math.abs(e.changedTouches[0].clientY - startTouchPos.y);

    if (distX < CLICK_THRESHOLD && distY < CLICK_THRESHOLD) {
      const rect = dom.getBoundingClientRect();
      mouse.x = ((e.changedTouches[0].clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.changedTouches[0].clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(clickablePendants, true);

      if (intersects.length > 0) {
        let targetGroup = intersects[0].object;
        while (targetGroup.parent && !clickablePendants.includes(targetGroup)) {
          targetGroup = targetGroup.parent;
        }

        if (clickablePendants.includes(targetGroup)) {
          const linkIndex = targetGroup.userData.linkIndex;
          const targetUrl = targetLinks[linkIndex];
          if (targetUrl) {
            window.location.href = targetUrl;
          }
        }
      }
    }
  }
});

// 창 크기가 바뀔 때 카메라의 Z축 거리를 유동적으로 계산하도록 수정
window.addEventListener("resize", () => {
  camera.aspect = container.clientWidth / container.clientHeight;
  camera.updateProjectionMatrix();
  camera.position.z = getResponsiveCameraZ();
  renderer.setSize(container.clientWidth, container.clientHeight);
});

// 8. 물리 연산 루프
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
          if (i === 0) {
            const dir = p.position.clone().sub(currentWorldAttachPoint);
            dir.normalize();
            p.position.copy(currentWorldAttachPoint.clone().add(dir.multiplyScalar(chain.segmentLength)));
          } else {
            const prevP = chain.points[i - 1];
            const targetLen = (p.type === 'pendant') ? chain.pendantLength : chain.segmentLength;
            
            const dir = p.position.clone().sub(prevP.position);
            dir.normalize();
            p.position.copy(prevP.position.clone().add(dir.multiplyScalar(targetLen)));
          }
        });
      }

      chain.points.forEach((p, i) => {
        p.mesh.position.copy(p.position);

        if (p.type === 'chain') {
          const targetLook = (i === 0) ? currentWorldAttachPoint : chain.points[i - 1].position;
          p.mesh.lookAt(targetLook);
          p.mesh.rotateX(Math.PI / 2); 
          if (p.index % 2 === 0) {
            p.mesh.rotateY(Math.PI / 2); 
          }
        } else if (p.type === 'pendant') {
          p.mesh.lookAt(p.mesh.position.clone().add(new THREE.Vector3(0, 0, 1)));
        }
      });
    });
  }

  renderer.render(scene, camera);
}

animate();