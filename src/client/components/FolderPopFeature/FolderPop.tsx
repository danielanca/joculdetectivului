import { useEffect, useState } from "react";
import "./FolderPop.scss";

interface FileStylingRule {
  calculateWidth: (folderRect: DOMRect) => number;
  calculateHeight: (folderRect: DOMRect) => number;
  calculateTranslateX: (folderRect: DOMRect, fileRect: DOMRect) => number;
  calculateTranslateY: (folderRect: DOMRect, fileRect: DOMRect) => number;
  calculateRotation?: () => string; // Optional
}

const stylingRules: Record<string, FileStylingRule> = {
  file1: {
    calculateWidth: (folderRect: DOMRect) => folderRect.width * 0.68,
    calculateHeight: (folderRect: DOMRect) => folderRect.height * 0.56,
    calculateTranslateX: (folderRect: DOMRect, fileRect: DOMRect) =>
      folderRect.left - fileRect.left - fileRect.width * 0.8,
    calculateTranslateY: (folderRect: DOMRect, fileRect: DOMRect) =>
      folderRect.top - fileRect.top - 0.25 * (folderRect.top - fileRect.top),
  },
  file2: {
    calculateWidth: (folderRect: DOMRect) => folderRect.width * 0.57,
    calculateHeight: (folderRect: DOMRect) => folderRect.height * 0.5,
    calculateTranslateX: (folderRect: DOMRect, fileRect: DOMRect) =>
      folderRect.right - fileRect.right - fileRect.width * -0.8,
    calculateTranslateY: (folderRect: DOMRect, fileRect: DOMRect) => folderRect.top - fileRect.top,
    calculateRotation: () => "3",
  },
  file3: {
    calculateWidth: (folderRect: DOMRect) => folderRect.width * 0.5,
    calculateHeight: (folderRect: DOMRect) => folderRect.height * 0.5,
    calculateTranslateX: (folderRect: DOMRect, fileRect: DOMRect) =>
      folderRect.right - fileRect.right - fileRect.width * -0.9,
    calculateTranslateY: (folderRect: DOMRect, fileRect: DOMRect) => (folderRect.top - fileRect.top) * -0.55,
    calculateRotation: () => `5`,
  },
  file4: {
    // Define different logic for file2
    calculateWidth: (folderRect: DOMRect) => folderRect.width * 0.4,
    calculateHeight: (folderRect: DOMRect) => folderRect.height * 0.3,
    calculateTranslateX: (folderRect: DOMRect, fileRect: DOMRect) =>
      folderRect.right - fileRect.right - fileRect.width * 2.5,
    calculateTranslateY: (folderRect: DOMRect, fileRect: DOMRect) => (folderRect.top - fileRect.top) * -0.41,
    calculateRotation: () => "-5",
  },
};

const applyStyling = () => {
  const folderFront = document.querySelector(".folderFront");

  if (folderFront instanceof HTMLElement) {
    const folderRect = folderFront.getBoundingClientRect();

    Object.entries(stylingRules).forEach(([fileClass, rules]) => {
      const file = document.querySelector(`.${fileClass}`);
      if (file instanceof HTMLElement) {
        const fileRect = file.getBoundingClientRect();

        file.style.width = `${rules.calculateWidth(folderRect)}px`;
        file.style.height = `${rules.calculateHeight(folderRect)}px`;
        file.style.transform = `translate(${rules.calculateTranslateX(
          folderRect,
          fileRect,
        )}px, ${rules.calculateTranslateY(folderRect, fileRect)}px)`;

        if (rules.calculateRotation && typeof rules.calculateRotation === "function") {
          file.style.transform += ` rotate(${rules.calculateRotation()}deg)`;
        }
      }
    });
  }
};
const deactivateStyling = () => {
  // Iterate over each file defined in the styling rules
  Object.keys(stylingRules).forEach(fileClass => {
    const file = document.querySelector(`.${fileClass}`);
    if (file instanceof HTMLElement) {
      file.style.transform = "translate(0px, 0px)";
    }
  });
};
const FolderPop = () => {
  const [isFolderOpen, setIsFolderOpen] = useState(false);
  const [lastWindowWidth, setLastWidth] = useState(0);
  useEffect(() => {
    setLastWidth(window.innerWidth);
  }, []);
  useEffect(() => {
    const folder = document.querySelector(".folderFront");

    if (folder) {
      const handleClick = () => {
        setIsFolderOpen(prevState => !prevState); // Toggle the state
      };
      folder.addEventListener("click", handleClick);

      const files = document.querySelectorAll<HTMLElement>(".file");
      console.log("isFolderOpen:", isFolderOpen);

      files.forEach(file => {
        if (isFolderOpen) {
          file.classList.add("activated");
          applyStyling();
        } else {
          file.classList.remove("activated");
          deactivateStyling();
        }
      });

      return () => folder.removeEventListener("click", handleClick);
    }
  }, [isFolderOpen]);

  useEffect(() => {
    const onWidthResize = () => {
      const currentWidth = window.innerWidth;
      if (currentWidth !== lastWindowWidth) {
        setIsFolderOpen(false);
        deactivateStyling();
        setLastWidth(currentWidth);
      }
    };
    window.addEventListener("resize", onWidthResize);

    return () => {
      window.removeEventListener("resize", onWidthResize);
    };
  }, []);

  return (
    <div className="folderContainer">
      <div className="folderFront"></div>
      <div className="file file1"></div>
      <div className="file file2"></div>
      <div className="file file3"></div>
      <div className="file file4"></div>
    </div>
  );
};

export default FolderPop;
