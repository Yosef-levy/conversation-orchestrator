import React from "react";

export function Modal(props: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer: React.ReactNode;
}) {
  return (
    <div className="modalOverlay" role="dialog" aria-modal="true" onClick={props.onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modalHeader">{props.title}</div>
        <div className="modalBody">{props.children}</div>
        <div className="modalFooter">{props.footer}</div>
      </div>
    </div>
  );
}

