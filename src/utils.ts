import {
  Field,
  Mina,
  PrivateKey,
  PublicKey,
  fetchAccount,
} from 'snarkyjs';

// ========================================================

export const loopUntilAccountExists = async (
  { account,
    eachTimeNotExist,
    isZkAppAccount
  }:
    {
      account: PublicKey,
      eachTimeNotExist: () => void,
      isZkAppAccount: boolean
    }
) => {
  for (; ;) {
    let response = await fetchAccount({ publicKey: account });
    let accountExists = response.error == null;
    if (isZkAppAccount) {
      accountExists = accountExists && response.account!.appState != null;
    }
    if (!accountExists) {
      await eachTimeNotExist();
      await new Promise((resolve) => setTimeout(resolve, 5000));
    } else {
      // TODO add optional check that verification key is correct once this is available in SnarkyJS
      return response.account!;
    }
  }
};

// ========================================================

interface ToString {
  toString: () => string;
}

type FetchedAccountResponse = Awaited<ReturnType<typeof fetchAccount>>
type FetchedAccount = NonNullable<FetchedAccountResponse["account"]>

export const makeAndSendTransaction = async <State extends ToString>({
  feePayerPrivateKey,
  zkAppPublicKey,
  mutateZkApp,
  transactionFee,
  getState,
  statesEqual,
  tokenId
}: {
  feePayerPrivateKey: PrivateKey,
  zkAppPublicKey: PublicKey,
  mutateZkApp: () => void,
  transactionFee: number,
  getState: () => State,
  statesEqual: (state1: State, state2: State) => boolean,
  tokenId?: string
}) => {
  const initialState = getState();

  // Why this line? It increments internal feePayer account variables, such as
  // nonce, necessary for successfully sending a transaction
  await fetchAccount({ publicKey: feePayerPrivateKey.toPublicKey() });

  let transaction = await Mina.transaction(
    { feePayerKey: feePayerPrivateKey, fee: transactionFee },
    () => {
      mutateZkApp();
    }
  );

  // fill in the proof - this can take a while...
  console.log('Creating an execution proof...');
  const time0 = Date.now();
  await transaction.prove();
  transaction.sign([feePayerPrivateKey, PrivateKey.fromBase58('EKF4FGPfDEuf8PBbSqeDn75wEmNDUQdNV8HsK2ZYwHiNGja7ZtN3')]);
  const time1 = Date.now();
  console.log('creating proof took', (time1 - time0) / 1e3, 'seconds');

  console.log('transaction json', transaction.toJSON());
  
  console.log('Sending the transaction...');
  const res = await transaction.send();
  const hash = await res.hash(); // This will change in a future version of SnarkyJS
  if (hash == null) {
    console.log('error sending transaction (see above)');
  } else {
    console.log(
      'See transaction at',
      'https://berkeley.minaexplorer.com/transaction/' + hash
    );
  }

  console.log('waiting')
  await res.wait();
  let state = getState();

  let stateChanged = false;
  while (!stateChanged) {
    console.log(
      'waiting for zkApp state to change... (current state: ',
      state.toString() + ')'
    );
    await new Promise((resolve) => setTimeout(resolve, 5000));
    await fetchAccount({ publicKey: zkAppPublicKey });
    state = await getState();
    stateChanged = !statesEqual(initialState, state);

    console.log('fetching acc with tokenid', tokenId)
    const account1 = await fetchAccount({ publicKey: feePayerPrivateKey.toPublicKey(), tokenId: tokenId });

    console.log('bet acc balance=', account1.account?.balance.value.toString());

  }
};

// ========================================================

export const zkAppNeedsInitialization = async (
  { zkAppAccount }:
    { zkAppAccount: FetchedAccount }
) => {
  console.warn('warning: using a `utils.ts` written before `isProved` made available. Check https://docs.minaprotocol.com/zkapps/tutorials/deploying-to-a-live-network for updates');
  // TODO when available in the future, use isProved.
  const allZeros = zkAppAccount.appState!.every((f: Field) =>
    f.equals(Field.zero).toBoolean()
  );
  const needsInitialization = allZeros;
  return needsInitialization;
}