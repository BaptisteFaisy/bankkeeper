// HarborFigure.tsx — accessible container for the waiting harbour canvas.
//
// Displays the procedural 2D canvas of the waiting quayside, buoy and moored
// boat, alongside clear sentences detailing what will be proven on-chain
// and what is needed (the nightly testnet deployment under bankkeeper.testnet).
import { useEffect, useRef } from 'react';
import { HARBOR_H, HARBOR_W, startHarborScene } from './harbor';

export default function HarborFigure({ title, status }: { title: string; status: 'absent' | 'unreachable' }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) return;
    const scene = startHarborScene(canvas);
    return () => {
      scene.destroy();
    };
  }, []);

  const explanation = status === 'absent'
    ? 'Le contrat NEP-245 n\u2019est pas encore déployé sur le testnet (limite de débit du faucet public NEAR). Le déploiement s\u2019exécute cette nuit sous bankkeeper.testnet.'
    : 'Un contrat est configuré mais le RPC NEAR testnet n\u2019a pas renvoyé de réponse lisible pour les jetons demandés.';

  const whatWillBeProven = 'Ce qui sera prouvé : soldes mt_supply lus en direct, transfert de licence NEP-245, rachat de note de dette et dépouillement du conseil portuaire.';
  const whatIsMissing = 'Ce qui manque : l\u2019adresse du compte déployé (renseignée par ?contract= ou tidewater-chain-v1).';

  return (
    <figure className="pf-harbor-figure" aria-labelledby="pf-harbor-caption">
      <div className="pf-harbor-canvas-wrap">
        <canvas
          ref={canvasRef}
          className="pf-harbor-canvas"
          width={HARBOR_W}
          height={HARBOR_H}
          role="img"
          aria-label="Dessin procédural du port : un quai en bois, un bateau au mouillage et une bouée sous un ciel calme, dans l'attente du contrat testnet."
        />
      </div>
      <figcaption id="pf-harbor-caption" className="pf-harbor-caption">
        <div className="pf-harbor-status-row">
          <span className="pf-badge pf-badge-warn">{title}</span>
          <span className="pf-harbor-expl">{explanation}</span>
        </div>
        <div className="pf-harbor-details">
          <p>
            <strong className="pf-ink-accent">&bull; {whatWillBeProven}</strong>
          </p>
          <p>
            <span className="pf-muted">&bull; {whatIsMissing}</span>
          </p>
        </div>
      </figcaption>
    </figure>
  );
}
