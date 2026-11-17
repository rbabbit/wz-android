"""Exercise the actual network packager's bounded attachment/path guards, without a delivery ZIP."""
from pathlib import Path
from hashlib import sha256
import importlib.util
import json
import tempfile
import sys
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
PACKAGER = ROOT / 'release-records/package-network-test-source.py'

def main():
    spec = importlib.util.spec_from_file_location('network_packager_checks', PACKAGER)
    module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
    checks = []
    def rejects(callback, label):
        try: callback()
        except RuntimeError: checks.append(label); return
        raise AssertionError(label)
    if '--ui-password-only' in sys.argv:
        path = ROOT / 'release-records/network-source-guard-checks.json'
        previous = json.loads(path.read_text(encoding='utf-8'))
        assert previous['passed'] is True
        node = {'class':'android.widget.Button','resource-id':'example:id/button','bounds':'[0,0][100,48]','password':'false'}
        module.secret_check('uia.json', json.dumps(node).encode()); checks.append('UIAutomator false attribute accepted with node schema')
        rejects(lambda: module.secret_check('secret.json', b'{"password":"false"}'), 'password string false outside UIAutomator refused')
        rejects(lambda: module.secret_check('secret.json', json.dumps(dict(node,password='true')).encode()), 'UIAutomator true attribute remains refused')
        rejects(lambda: module.secret_check('secret.json', json.dumps(dict(node,bounds='unknown')).encode()), 'unverified node geometry does not exempt password')
        result = dict(passed=True, packagerSHA256=sha256(PACKAGER.read_bytes()).hexdigest(), focusedChecks=checks,
                      previousFullGuardReport=previous, scope='Only focused UIAutomator false-attribute guard regression; prior full guard proof retained',
                      archiveCreated=False, phoneOperations=False, publicationPerformed=False)
        path.write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8'); print(json.dumps(result,indent=2)); return
    with tempfile.TemporaryDirectory(prefix='wz-network-package-') as folder:
        temp = Path(folder); module.PROFILE = temp / 'profile'; module.PROFILE.mkdir()
        module.stage([('VALIDATION.json', b'{"passed":false,"status":"incomplete"}')])
        module.stage([('VALIDATION.json', b'{"passed":false,"status":"incomplete"}')])
        checks.append('actual stage accepts exact repeated failed/incomplete metadata')
        rejects(lambda: module.stage([('new.json', b'{}'), ('VALIDATION.json', b'{"passed":true}')]), 'changed existing attachment refused before any payload write')
        assert not (module.PROFILE / 'new.json').exists()
        rejects(lambda: module.stage([('../escape.json', b'{}')]), 'path traversal refused')
        outside = temp / 'outside.json'; outside.write_bytes(b'{"preserved":true}')
        link = module.PROFILE / 'RUNTIME-ATTACHMENTS.json'
        original_is_symlink = Path.is_symlink
        # Windows does not grant this process CreateSymbolicLink privilege. Exercise
        # the actual guard with only that filesystem observation substituted.
        with patch.object(Path, 'is_symlink', lambda path: path == link or original_is_symlink(path)):
            rejects(lambda: module.stage([('first.json', b'{}'), ('RUNTIME-ATTACHMENTS.json', b'{}')]), 'reported symlink manifest target refused before any payload write')
        assert outside.read_bytes() == b'{"preserved":true}' and not (module.PROFILE / 'first.json').exists()
        for key in ['joinToken', 'joinTokens', 'gamePassword', 'lobbyConnectToken', 'hostPassword', 'phoneSerial', 'Authorization', 'attest']:
            rejects(lambda key=key: module.secret_check('capture.json', json.dumps({key:'not-exportable'}).encode()), 'private JSON field refused: '+key)
        rejects(lambda: module.secret_check('dump.key', b'nonsecret'), 'private source suffix refused')
        rejects(lambda: module.secret_check('capture.txt', b'-----BEGIN ' + b'PRIVATE KEY-----'), 'private key bytes refused')
        module.secret_check('curated.json', b'{"tokenRequired":true,"signedRequestPreserved":true,"candidateAPK_SHA256":"abc"}')
        checks.append('curated boolean/hash evidence remains usable')
        rejects(lambda: module.bounded(outside, 2), 'proof bound enforced')
        module.RUNTIME = temp / 'runtime'; module.RUNTIME.mkdir()
        for subtree in ['official-owned-host', 'private-host', 'userdata', 'raw-phone', 'ChromeDownloads']:
            rejects(lambda subtree=subtree: module.evidence_path(module.RUNTIME/subtree/'config.json'), 'private evidence subtree refused: '+subtree)
        assert module.evidence_path(module.RUNTIME/'curated.json') == module.RUNTIME/'curated.json'
        checks.append('owned root curated evidence allowed')
    result = dict(passed=True, packagerSHA256=sha256(PACKAGER.read_bytes()).hexdigest(), checks=checks,
                  scope='actual helper guards; full chained restoration runs only after source freeze',
                  symlinkCheck='Path.is_symlink observation substituted; Windows symlink privilege unavailable',
                  archiveCreated=False, phoneOperations=False, publicationPerformed=False)
    path = ROOT / 'release-records/network-source-guard-checks.json'
    path.write_text(json.dumps(result, indent=2)+'\n', encoding='utf-8')
    print(json.dumps(result, indent=2))

if __name__ == '__main__': main()
