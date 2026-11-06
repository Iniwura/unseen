import React from 'react';
import {Composition} from 'remotion';
import {ProofStudy} from './ProofStudy';

export const RemotionRoot: React.FC = () => (
  <Composition id="UNSEENProofStudy" component={ProofStudy} durationInFrames={360} fps={30} width={1920} height={1080}/>
);
