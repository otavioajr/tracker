package protocol

import "fmt"

// MaxOnlineCommandBytes keeps the GT06 short-frame length within one byte.
const MaxOnlineCommandBytes = 245

// BuildOnlineCommand reproduces the installed gateway's GT06 0x80 wire format.
// The zero server flag and big-endian sequence are part of that legacy contract.
func BuildOnlineCommand(sequence uint16, command string) ([]byte, error) {
	if len(command) == 0 || len(command) > MaxOnlineCommandBytes {
		return nil, fmt.Errorf("gt06: command must contain 1..%d bytes", MaxOnlineCommandBytes)
	}
	body := []byte{byte(len(command) + 10), 0x80, byte(len(command) + 4), 0, 0, 0, 0}
	body = append(body, []byte(command)...)
	body = append(body, byte(sequence>>8), byte(sequence))
	checksum := crcITU(body)
	frame := append([]byte{0x78, 0x78}, body...)
	return append(frame, byte(checksum>>8), byte(checksum), gt06StopHi, gt06StopLo), nil
}
