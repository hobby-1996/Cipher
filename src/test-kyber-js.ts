import { MlKem1024 } from 'crystals-kyber-js';

async function test() {
  const kem = new MlKem1024();
  const [pk, sk] = await kem.generateKeyPair();
  const [ct, ss1] = await kem.encap(pk);
  const ss2 = await kem.decap(ct, sk);
  console.log('ss1:', ss1);
  console.log('ss2:', ss2);
  console.log('match:', ss1.toString() === ss2.toString());
}
test();
