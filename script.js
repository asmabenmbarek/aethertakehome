import * as THREE from 'https://cdn.skypack.dev/three@0.137';

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer();
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

camera.position.z = 5;
camera.position.y = 2;
camera.lookAt(0, 0, 0);

let points = [];
let isShapeClosed = false;
let buildingMesh = null;

function latLngToTile(lat, lng, zoom) {
    // Original logic
    const latRad = lat * Math.PI / 180;
    const n = Math.pow(2, zoom);
    const x = Math.floor(n * (lng + 180) / 360);
    const y = Math.floor(n * (1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2);

    // Additional custom logic
    console.log(`Tile coordinates: x=${x}, y=${y}, z=${zoom}`);

    return { x: x, y: y, z: zoom };
}

const tileServerURL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

const tileCoords = latLngToTile(40.6892, -74, 18);
const tilesToLoad = [];
const numTiles = 3;

for (let i = 0; i < numTiles; i++) {
    for (let j = 0; j < numTiles; j++) {
        const x = tileCoords.x - Math.floor(numTiles / 2) + i;
        const y = tileCoords.y - Math.floor(numTiles / 2) + j;
        tilesToLoad.push({ x, y, z: tileCoords.z });
    }
}

const canvas = document.createElement('canvas');
canvas.width = 400;
canvas.height = 500;
const ctx = canvas.getContext('2d');

let tilesLoaded = 0;

tilesToLoad.forEach(tile => {
    const tileUrl = tileServerURL.replace('{z}', tile.z).replace('{x}', tile.x).replace('{y}', tile.y);

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
        ctx.drawImage(img, (tile.x - tilesToLoad[0].x) * (600 / numTiles), (tile.y - tilesToLoad[0].y) * (600 / numTiles), 600 / numTiles, 600 / numTiles);
        tilesLoaded++;
        if (tilesLoaded === tilesToLoad.length) {
            const texture = new THREE.CanvasTexture(canvas);
            scene.background = texture;
            texture.needsUpdate = true;

            setupDrawing(canvas, ctx, texture);
        }
    };
    img.src = tileUrl;
});

function setupDrawing(canvas, ctx, texture) {
    renderer.domElement.addEventListener('click', addPoint);

    function addPoint(e) {
        if (isShapeClosed) return;

        const [x, y] = getMousePos(e);
        points.push([x, y]);

        redraw(ctx, texture);

        if (points.length >= 3) {
            const firstPoint = points[0];
            const distance = Math.sqrt(
                Math.pow(x - firstPoint[0], 2) + Math.pow(y - firstPoint[1], 2)
            );

            const closingDistanceThreshold = 20;

            if (distance < closingDistanceThreshold) {
                isShapeClosed = true;
                redraw(ctx, texture, true);
                renderer.domElement.removeEventListener('click', addPoint);
                createHeightInput();
                createBuilding(0.1); // Initial height
            }
        }
    }

    function createHeightInput() {
        const heightInput = document.createElement('input');
        heightInput.type = 'number';
        heightInput.min = '0';
        heightInput.max = '10';
        heightInput.step = '0.1';
        heightInput.value = '0';
        heightInput.style.position = 'absolute';
        heightInput.style.top = '10px';
        heightInput.style.left = '10px';
        document.body.appendChild(heightInput);

        heightInput.addEventListener('input', (e) => {
            const height = parseFloat(e.target.value);
            createBuilding(height);
        });
    }

    function createBuilding(height) {
        if (buildingMesh) {
            scene.remove(buildingMesh);
        }
    
        // Normalize the 2D shape points
        const normalizedPoints = points.map(point => {
            return new THREE.Vector2(
                (point[0] / canvas.width) * 4 - 2,
                -(point[1] / canvas.height) * 4 + 2
            );
        });
    
        // The shape should be on the surface of the map, so we need to position it correctly
        const shape = new THREE.Shape(normalizedPoints);
    
        // Calculate geometry for extrusion
        const extrudeSettings = {
            steps: 1,
            depth: height, // Height of the building
            bevelEnabled: false
        };
    
        const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
        const material = new THREE.MeshPhongMaterial({
            color: 0x808080,
            side: THREE.DoubleSide
        });
    
        buildingMesh = new THREE.Mesh(geometry, material);
    
        // Align the building with the center of the shape
        buildingMesh.position.set(0, 0, 0);  // Set the base position
    
        // Add the building mesh to the scene
        scene.add(buildingMesh);
    
        // Add lighting if not already added
        if (!scene.children.find(child => child instanceof THREE.DirectionalLight)) {
            const light = new THREE.DirectionalLight(0xffffff, 1);
            light.position.set(1, 1, 1);
            scene.add(light);
            scene.add(new THREE.AmbientLight(0x404040));
        }
    }
    

    function redraw(ctx, texture, closeShape = false) {
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = canvas.width;
        tempCanvas.height = canvas.height;
        const tempCtx = tempCanvas.getContext('2d');
    
        tempCtx.drawImage(canvas, 0, 0);
    
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    
        // Draw the tempCanvas (map) onto the main canvas
        ctx.drawImage(tempCanvas, 0, 0);
    
        ctx.save();
        ctx.beginPath();
        ctx.strokeStyle = '#FF0000';
        ctx.lineWidth = 5;
        ctx.lineCap = 'round';
    
        points.forEach(point => {
            ctx.beginPath();
            ctx.arc(point[0], point[1], 5, 0, Math.PI * 2);
            ctx.fill();
        });
    
        if (points.length > 1) {
            ctx.beginPath();
            ctx.moveTo(points[0][0], points[0][1]);
            for (let i = 1; i < points.length; i++) {
                ctx.lineTo(points[i][0], points[i][1]);
            }
    
            if (closeShape) {
                ctx.lineTo(points[0][0], points[0][1]);
            }
            ctx.stroke();
        }
    
        ctx.restore();
        texture.needsUpdate = true;
    }

    function getMousePos(e) {
        const rect = renderer.domElement.getBoundingClientRect();
        const x = ((e.clientX - rect.left) / rect.width) * canvas.width;
        const y = ((e.clientY - rect.top) / rect.height) * canvas.height;
        return [x, y];
    }
}

function animate() {
    requestAnimationFrame(animate);
    renderer.render(scene, camera);
}

animate();