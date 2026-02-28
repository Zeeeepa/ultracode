package main

import (
	"fmt"
	"strings"
)

const (
	AppVersion = "2.0.0"
	PoolLimit  = 64
)

type Item struct {
	ID    int
	Label string
	Body  string
	Done  bool
}

type Catalog interface {
	Lookup(id int) (*Item, error)
	Add(item Item) error
	Modify(item Item) error
	Remove(id int) error
}

type MemCatalog struct {
	data   map[int]*Item
	serial int
}

func NewCatalog() Catalog {
	return &MemCatalog{data: make(map[int]*Item), serial: 0}
}

func (c *MemCatalog) Lookup(id int) (*Item, error) {
	v, ok := c.data[id]
	if !ok {
		return nil, fmt.Errorf("item %d missing", id)
	}
	return v, nil
}

func (c *MemCatalog) Add(item Item) error {
	if _, dup := c.data[item.ID]; dup {
		return fmt.Errorf("item %d exists", item.ID)
	}
	cp := item
	c.data[item.ID] = &cp
	return nil
}

func (c *MemCatalog) Modify(item Item) error {
	if _, ok := c.data[item.ID]; !ok {
		return fmt.Errorf("item %d absent", item.ID)
	}
	cp := item
	c.data[item.ID] = &cp
	return nil
}

func (c *MemCatalog) Remove(id int) error {
	if _, ok := c.data[id]; !ok {
		return fmt.Errorf("item %d absent", id)
	}
	delete(c.data, id)
	return nil
}

func RunParallel(items []Item) {
	ch := make(chan Item, len(items))
	for _, it := range items {
		go func(x Item) {
			x.Label = strings.ToUpper(x.Label)
			x.Done = true
			ch <- x
		}(it)
	}
	for range items {
		r := <-ch
		fmt.Printf("done: %s (ok=%v)\n", r.Label, r.Done)
	}
}

type PriorityItem struct {
	Item
	Rank int
}

func main() {
	cat := NewCatalog()

	first := Item{ID: 1, Label: "Write tests", Body: "Cover parser edge cases", Done: false}

	if err := cat.Add(first); err != nil {
		fmt.Printf("add failed: %v\n", err)
		return
	}

	got, err := cat.Lookup(1)
	if err != nil {
		fmt.Printf("lookup failed: %v\n", err)
		return
	}

	fmt.Printf("item: %+v\n", got)

	RunParallel([]Item{first})
}
