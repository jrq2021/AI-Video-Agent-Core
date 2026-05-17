import { useRef, useMemo } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Points, PointMaterial } from "@react-three/drei";
import * as THREE from "three";

/* ── 粒子场：数百发光点 3D 漂浮 + 鼠标视差 ──────────────────────── */

function ParticleField() {
  const pointsRef = useRef();

  const [positions, colors] = useMemo(() => {
    // 如果觉得不够密，由于性能优化了，可以大胆调到 800-1000
    const count = 400;
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);

    const c1 = new THREE.Color("#3b82f6"); // blue-500
    const c2 = new THREE.Color("#6366f1"); // indigo-500
    const c3 = new THREE.Color("#8b5cf6"); // violet-500

    // 💡 优化点 1：把 Color 实例化提到循环外，防止创建数百个临时对象触发 GC (垃圾回收)
    const tempColor = new THREE.Color();

    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      // 球形分布，半径 6-15
      const r = 6 + Math.random() * 9;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);

      pos[i3] = r * Math.sin(phi) * Math.cos(theta);
      pos[i3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      pos[i3 + 2] = r * Math.cos(phi);

      // 随机蓝紫渐变颜色，复用 tempColor
      const mix = Math.random();
      if (mix < 0.5) {
        tempColor.copy(c1).lerp(c2, mix * 2);
      } else {
        tempColor.copy(c2).lerp(c3, (mix - 0.5) * 2);
      }

      col[i3] = tempColor.r;
      col[i3 + 1] = tempColor.g;
      col[i3 + 2] = tempColor.b;
    }
    return [pos, col];
  }, []);

  // 💡 优化点 2：直接从 useFrame 的 state 中获取 pointer，干掉 MouseTracker 组件
  // 💡 优化点 3：引入 delta，让动画与帧率解绑 (Frame-rate independent)
  useFrame((state, delta) => {
    if (!pointsRef.current) return;

    // 缓慢自转
    pointsRef.current.rotation.x += 0.1 * delta;
    pointsRef.current.rotation.y += 0.15 * delta;

    // 鼠标视差偏移计算
    // state.pointer 的值自带归一化 (-1 到 1)，非常适合做视差系数
    const targetX = state.pointer.x * 1.5;
    const targetY = state.pointer.y * 1.0;

    // 使用 Three.js 内置的平滑插值，比手动算更优雅
    pointsRef.current.position.x = THREE.MathUtils.lerp(
      pointsRef.current.position.x,
      targetX,
      2 * delta, // 跟随阻尼感，值越大跟得越紧
    );
    pointsRef.current.position.y = THREE.MathUtils.lerp(
      pointsRef.current.position.y,
      targetY,
      2 * delta,
    );
  });

  return (
    <Points ref={pointsRef} positions={positions} colors={colors} stride={3}>
      <PointMaterial
        transparent
        vertexColors
        size={0.06}
        sizeAttenuation
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </Points>
  );
}

/* ── 主组件 ─────────────────────────────────────────────────────── */

export default function Background3D() {
  return (
    <div className="fixed inset-0 -z-10 pointer-events-none">
      <Canvas
        camera={{ position: [0, 0, 8], fov: 60 }}
        // 💡 优化点 4：纯粒子场景不需要抗锯齿，关掉能省很多 GPU 资源
        gl={{ antialias: false, alpha: true }}
        // 💡 优化点 5：限制最大设备像素比为 2，防止高刷 2K/4K 手机掉帧发烫
        dpr={[1, 2]}
        style={{ background: "transparent" }}
      >
        <ParticleField />
      </Canvas>
    </div>
  );
}
