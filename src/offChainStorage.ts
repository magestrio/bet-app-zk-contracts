import {
  Field,
  PublicKey,
  MerkleMap,
} from 'snarkyjs';

// ==============================================================================
type element = {
  key: string
  value: string
}

export function mapToTree(elements: Array<element>) {
  const tree = new MerkleMap();
  for (let element of elements) {
    tree.set(Field(element.key), Field(element.value));
  }
  return tree;
}

export const setUsers = async (
  serverAddress: string,
  zkAppAddress: PublicKey,
  idx2fields: element[],
  UserXMLHttpRequest: typeof XMLHttpRequest | null = null
) => {
  const items = new Array<element>();

  console.log('forming list');

  for (let element of idx2fields) {
    items.push({
      key: element.key.toString(),
      value: element.value.toString()
    })
  }

  console.log('pre post request')
  await makeRequest(
    'POST',
    serverAddress + '/users',
    JSON.stringify({
      zkAppAddress: zkAppAddress.toBase58(),
      items
    }),
    UserXMLHttpRequest
  ).catch(reson => {
    console.log('error', reson)
  });
}

export const getUsers = async (
  serverAddress: string,
  zkAppAddress: PublicKey,
  UserXMLHttpRequest: typeof XMLHttpRequest | null = null
) => {
  var params =
    'zkAppAddress=' + zkAppAddress.toBase58();

  const url = serverAddress + '/users?' + params;

  console.log('url=', url);

  const response = await makeRequest(
    'GET',
    url,
    null,
    UserXMLHttpRequest
  );

  const data = JSON.parse(response);

  console.log('data =', data);

  if (isEmpty(data)) {
    return [];
  }

  const items: Array<element> = data.items;
  return items
}

function isEmpty(obj: any) {
  return Object.keys(obj).length === 0;
}

// ==============================================================================

export const getPublicKey = async (
  serverAddress: string,
  UserXMLHttpRequest: typeof XMLHttpRequest | null = null
) => {
  const response = await makeRequest(
    'GET',
    serverAddress + '/publicKey',
    null,
    UserXMLHttpRequest
  );

  const data = JSON.parse(response);

  const publicKey = PublicKey.fromBase58(data.serverPublicKey58);

  return publicKey;
};

// ==============================================================================

export function makeRequest(
  method: string,
  url: string,
  data: string | null = null,
  UserXMLHttpRequest: typeof XMLHttpRequest | null = null
): Promise<string> {
  return new Promise(function (resolve, reject) {
    let xhr: XMLHttpRequest;
    if (UserXMLHttpRequest != null) {
      xhr = new UserXMLHttpRequest();
    } else {
      xhr = new XMLHttpRequest();
    }
    xhr.open(method, url);
    xhr.onload = function () {
      if (this.status >= 200 && this.status < 300) {
        resolve(xhr.responseText);
      } else {
        reject({
          status: this.status,
          statusText: xhr.responseText,
        });
      }
    };
    xhr.onerror = function () {
      reject({
        status: this.status,
        statusText: xhr.responseText,
      });
    };
    if (data != null) {
      xhr.setRequestHeader('Content-Type', 'application/json;charset=UTF-8');
    }
    xhr.send(data);
  });
}


// ==============================================================================
// ==============================================================================
