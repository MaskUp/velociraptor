/*
   Velociraptor - Hunting Evil
   Copyright (C) 2019 Velocidex Innovations.

   This program is free software: you can redistribute it and/or modify
   it under the terms of the GNU Affero General Public License as published
   by the Free Software Foundation, either version 3 of the License, or
   (at your option) any later version.

   This program is distributed in the hope that it will be useful,
   but WITHOUT ANY WARRANTY; without even the implied warranty of
   MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
   GNU Affero General Public License for more details.

   You should have received a copy of the GNU Affero General Public License
   along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/
package api

import (
	"os"
)

type FileReader interface {
	Read(buff []byte) (int, error)
	Seek(offset int64, whence int) (int64, error)
	Stat() (FileInfo, error)
	Close() error
}

// A file store writer writes files in the filestore. Filestore files
// are not as flexible as real files and only provide a subset of
// functionality. Specifically they can not be over-written - only
// appended to. They can be truncated but only to 0 size.
type FileWriter interface {
	Size() (int64, error)
	Write(data []byte) (int, error)
	Truncate() error
	Close() error
}

type FileInfo interface {
	os.FileInfo
	PathSpec() FSPathSpec
}

type WalkFunc func(urn FSPathSpec, info os.FileInfo) error
type FileStore interface {
	ReadFile(filename FSPathSpec) (FileReader, error)
	WriteFile(filename FSPathSpec) (FileWriter, error)
	StatFile(filename FSPathSpec) (FileInfo, error)
	ListDirectory(dirname FSPathSpec) ([]FileInfo, error)
	Walk(root FSPathSpec, cb WalkFunc) error
	Delete(filename FSPathSpec) error
	Move(src, dest FSPathSpec) error
}
