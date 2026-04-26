import { useRef } from "react";
import { motion } from "framer-motion";

// Standalone export so non-Home pages don't drag the Three.js / globe
// component into their bundles. The stars themselves are generated once on
// mount and persisted via ref — re-renders never recreate the 150 motion.divs.
export function StarField({ numStars = 150 }) {
  const starsRef = useRef(null);

  if (!starsRef.current) {
    starsRef.current = Array.from({ length: numStars }).map((_, i) => {
      const size = Math.random() * 3 + 1;
      const duration = Math.random() * 5 + 3;
      const positionX = Math.random() * 100;
      const positionY = Math.random() * 100;

      return (
        <motion.div
          key={i}
          className="absolute bg-white rounded-full"
          style={{
            width: `${size}px`,
            height: `${size}px`,
            left: `${positionX}%`,
            top: `${positionY}%`,
            opacity: Math.random() * 0.5 + 0.3,
            filter: "drop-shadow(0 0 5px rgba(255, 255, 255, 0.8))",
          }}
          animate={{ opacity: [0.2, 1, 0.2] }}
          transition={{
            duration,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
      );
    });
  }

  return (
    <div className="absolute w-full h-full overflow-hidden pointer-events-none z-0">
      {starsRef.current}
    </div>
  );
}

export default StarField;
