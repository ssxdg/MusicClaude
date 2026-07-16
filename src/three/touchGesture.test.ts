import { describe, it, expect } from "vitest";
import { centroid, pinchDistance, thrustFromDrag, pinchSpeed, classifyGesture } from "./touchGesture";
import * as touchGesture from "./touchGesture";

describe("touchGesture — centroid / distance", () => {
  it("centroid is the midpoint", () => {
    expect(centroid({ x: 0, y: 0 }, { x: 10, y: 20 })).toEqual({ x: 5, y: 10 });
  });
  it("distance is euclidean", () => {
    expect(pinchDistance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
  });
});

describe("touchGesture — thrustFromDrag (WASD convention: z<0 forward, x>0 right)", () => {
  const O = { x: 100, y: 100 };
  it("inside the deadzone → no thrust", () => {
    expect(thrustFromDrag(O, { x: 105, y: 95 })).toEqual({ z: 0, x: 0 });
  });
  it("fingers pushed UP → forward (z negative)", () => {
    const t = thrustFromDrag(O, { x: 100, y: 100 - 130 }); // 130px up, span 120, dz 10
    expect(t.z).toBeLessThan(0);
    expect(t.x).toBe(0);
  });
  it("fingers pushed DOWN → back (z positive)", () => {
    expect(thrustFromDrag(O, { x: 100, y: 100 + 130 }).z).toBeGreaterThan(0);
  });
  it("fingers pushed RIGHT → strafe right (x positive)", () => {
    expect(thrustFromDrag(O, { x: 100 + 130, y: 100 }).x).toBeGreaterThan(0);
  });
  it("fingers pushed LEFT → strafe left (x negative)", () => {
    expect(thrustFromDrag(O, { x: 100 - 130, y: 100 }).x).toBeLessThan(0);
  });
  it("diagonal up-right → forward + right, independent per axis", () => {
    const t = thrustFromDrag(O, { x: 100 + 130, y: 100 - 130 });
    expect(t.z).toBeLessThan(0); // forward
    expect(t.x).toBeGreaterThan(0); // right
  });
  it("clamps to [-1, 1] beyond full span", () => {
    const t = thrustFromDrag(O, { x: 100, y: 100 - 9999 });
    expect(t.z).toBe(-1);
  });
  it("deadzone is subtracted (not full magnitude at the edge)", () => {
    // 10px deadzone + 120px span: a 70px displacement → (70-10)/120 = 0.5
    const t = thrustFromDrag(O, { x: 100, y: 100 + 70 });
    expect(t.z).toBeCloseTo(0.5, 5);
  });
});

describe("touchGesture — pinchSpeed (free-fly, clamp 0.1..80)", () => {
  it("spreading fingers (cur > prev) → faster", () => {
    expect(pinchSpeed(1, 100, 200)).toBe(2);
  });
  it("pinching in (cur < prev) → slower", () => {
    expect(pinchSpeed(2, 200, 100)).toBe(1);
  });
  it("clamps at the max (80)", () => {
    expect(pinchSpeed(50, 100, 1000)).toBe(80);
  });
  it("clamps at the min (0.1)", () => {
    expect(pinchSpeed(0.2, 1000, 100)).toBe(0.1);
  });
  it("a no-op pinch (cur === prev) returns speedMul UNCHANGED (strict ===, no drift)", () => {
    // FlyControls relies on `sm !== speedMul.current` to skip redundant store writes — must not drift.
    expect(pinchSpeed(5, 100, 100)).toBe(5);
  });
  it("guards a zero/invalid prev distance", () => {
    expect(pinchSpeed(3, 0, 100)).toBe(3);
  });
  it("guards NaN / negative distances (degenerate centroid never poisons speed)", () => {
    expect(pinchSpeed(5, 100, NaN)).toBe(5);
    expect(pinchSpeed(5, NaN, 100)).toBe(5);
    expect(pinchSpeed(5, 100, -50)).toBe(5);
  });
});

describe("touchGesture — classifyGesture (mode-lock: pan XOR pinch)", () => {
  const O = { x: 100, y: 100 };
  it("returns null until movement crosses the threshold", () => {
    expect(classifyGesture(O, { x: 105, y: 105 }, 200, 205)).toBeNull();
  });
  it("centroid moved more than distance changed → pan", () => {
    expect(classifyGesture(O, { x: 100, y: 70 }, 200, 205)).toBe("pan"); // 30px pan, 5px pinch
  });
  it("distance changed more than centroid moved → pinch", () => {
    expect(classifyGesture(O, { x: 103, y: 103 }, 200, 260)).toBe("pinch"); // ~4px pan, 60px pinch
  });
  it("a one-handed pinch (centroid drifts but distance dominates) → pinch, not pan", () => {
    // thumb anchored, index spreads 100px: centroid drifts ~50px, distance changes ~100px → pinch wins
    expect(classifyGesture(O, { x: 100, y: 150 }, 200, 300)).toBe("pinch");
  });
});

describe("touchGesture — wheelDollyDistance（自由视角滚轮推拉）", () => {
  const getWheelDollyDistance = () => {
    // 先通过运行时断言表达期望接口，避免功能尚未实现时因为静态导入报错而跳过真正的红灯验证。
    const fn = (touchGesture as unknown as {
      wheelDollyDistance?: (deltaY: number, cameraDistance: number) => number;
    }).wheelDollyDistance;
    expect(fn).toBeTypeOf("function");
    return fn!;
  };

  it("滚轮向上沿视线前进，向下沿视线后退", () => {
    const wheelDollyDistance = getWheelDollyDistance();
    expect(wheelDollyDistance(-100, 4000)).toBeGreaterThan(0);
    expect(wheelDollyDistance(100, 4000)).toBeLessThan(0);
  });

  it("远景单次推拉距离大于近景，并限制最大步长", () => {
    const wheelDollyDistance = getWheelDollyDistance();
    const near = Math.abs(wheelDollyDistance(-100, 600));
    const far = Math.abs(wheelDollyDistance(-100, 8000));
    expect(far).toBeGreaterThan(near);
    expect(far).toBeLessThanOrEqual(720);
  });

  it("零值或非法输入不会移动相机", () => {
    const wheelDollyDistance = getWheelDollyDistance();
    expect(wheelDollyDistance(0, 4000)).toBe(0);
    expect(wheelDollyDistance(Number.NaN, 4000)).toBe(0);
    expect(wheelDollyDistance(-100, Number.NaN)).toBe(0);
  });
});

describe("touchGesture — dampedDollyStep（滚轮阻尼位移）", () => {
  const getDampedDollyStep = () => {
    // 使用运行时接口断言保留明确的红灯阶段：先证明阻尼函数尚不存在，再补充实现。
    const fn = (touchGesture as unknown as {
      dampedDollyStep?: (remaining: number, deltaSeconds: number) => number;
    }).dampedDollyStep;
    expect(fn).toBeTypeOf("function");
    return fn!;
  };

  it("每帧只消费剩余位移的一部分，并保持移动方向", () => {
    const dampedDollyStep = getDampedDollyStep();
    const forward = dampedDollyStep(600, 1 / 60);
    const backward = dampedDollyStep(-600, 1 / 60);
    expect(forward).toBeGreaterThan(0);
    expect(forward).toBeLessThan(600);
    expect(backward).toBeLessThan(0);
    expect(backward).toBeGreaterThan(-600);
  });

  it("不同帧率下经过相同时间得到近似一致的位移", () => {
    const dampedDollyStep = getDampedDollyStep();
    const oneFrame = dampedDollyStep(600, 1 / 30);
    const firstHalf = dampedDollyStep(600, 1 / 60);
    const secondHalf = dampedDollyStep(600 - firstHalf, 1 / 60);
    expect(firstHalf + secondHalf).toBeCloseTo(oneFrame, 8);
  });

  it("零值、非法输入或非正帧间隔不会产生位移", () => {
    const dampedDollyStep = getDampedDollyStep();
    expect(dampedDollyStep(0, 1 / 60)).toBe(0);
    expect(dampedDollyStep(Number.NaN, 1 / 60)).toBe(0);
    expect(dampedDollyStep(600, Number.NaN)).toBe(0);
    expect(dampedDollyStep(600, 0)).toBe(0);
  });
});
