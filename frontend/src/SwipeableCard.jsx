import { useSpring, animated } from "@react-spring/web";
import { useDrag } from "@use-gesture/react";
import { useState } from "react";

export function SwipeableCard({ q, test, disabled, onAnswer }) {
  const [style, api] = useSpring(() => ({ x: 0, y: 0, rotate: 0, scale: 1 }));
  const [swipeState, setSwipeState] = useState(null); // null, 'LEFT', 'RIGHT'
  
  const bind = useDrag(({ active, movement: [mx, my], direction: [dx], velocity: [vx] }) => {
    if (disabled) return;
    const trigger = vx > 0.2 || Math.abs(mx) > 100;
    const dir = dx > 0 ? 1 : -1;
    
    if (!active && trigger) {
      // Swiped out
      const finalX = (window.innerWidth + 200) * dir;
      api.start({
        x: finalX,
        y: my + (Math.random() - 0.5) * 100,
        rotate: mx / 10,
        scale: 0.9,
        config: { friction: 50, tension: 200 }
      });
      const answer = dir === -1 ? "LEFT" : "RIGHT";
      onAnswer(answer);
    } else {
      // Dragging
      api.start({
        x: active ? mx : 0,
        y: active ? my : 0,
        rotate: active ? mx / 15 : 0,
        scale: active ? 1.05 : 1,
        config: { friction: 50, tension: active ? 800 : 500 }
      });
      if (active) {
        if (mx < -50) setSwipeState("LEFT");
        else if (mx > 50) setSwipeState("RIGHT");
        else setSwipeState(null);
      } else {
        setSwipeState(null);
      }
    }
  });

  return (
    <div className="swipeContainer">
      <div className="swipeIndicators">
        <div className={`indicator left ${swipeState === "LEFT" ? "active" : ""}`}>
          <span className="arrow">в†ђ</span>
          {test.cardLeftLabel}
        </div>
        <div className={`indicator right ${swipeState === "RIGHT" ? "active" : ""}`}>
          {test.cardRightLabel}
          <span className="arrow">в†’</span>
        </div>
      </div>
      
      <animated.div {...bind()} style={style} className={`swipeCard ${disabled ? 'disabled' : ''}`}>
        <div className="swipeCardInner">
          {q.imageUrl && <img src={q.imageUrl} alt="" className="swipeImage" />}
          <h2>{q.text}</h2>
        </div>
      </animated.div>
      
      <div className="swipeButtons">
        <button 
          className="swipeBtn left" 
          disabled={disabled}
          onClick={() => {
            api.start({ x: -500, rotate: -20, config: { duration: 250 } });
            setTimeout(() => onAnswer("LEFT"), 250);
          }}
        >
          <span className="arrow">в†ђ</span>
          {test.cardLeftLabel}
        </button>
        <button 
          className="swipeBtn right" 
          disabled={disabled}
          onClick={() => {
            api.start({ x: 500, rotate: 20, config: { duration: 250 } });
            setTimeout(() => onAnswer("RIGHT"), 250);
          }}
        >
          {test.cardRightLabel}
          <span className="arrow">в†’</span>
        </button>
      </div>
    </div>
  );
}
